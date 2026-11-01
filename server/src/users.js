// Accounts, passwords, per-device login tokens and invitations.
// Passwords are stored as scrypt hashes, tokens and invitation codes only as SHA-256 hashes.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { ObjectId } from 'mongodb';
import { config } from './config.js';
import { central, dropUserDb, prepareUserDb } from './db.js';
import { setFallbackTenant, tenantOf, withTenant } from './tenant.js';

const scrypt = promisify(crypto.scrypt);
const INVITE_DAYS = 7;

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const newSecret = () => crypto.randomBytes(32).toString('base64url');

export const tenantFor = (user) => tenantOf(user, config.mediaRoot, config.backupRoot);

/** What the app may see of an account. */
export function publicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
    hasPassword: Boolean(user.passwordHash),
  };
}

// ------------------------------------------------------------------ passwords

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function passwordMatches(password, stored) {
  if (!stored) return false;
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new AuthError(400, 'Das Passwort braucht mindestens 8 Zeichen');
}

function normalizeUsername(name) {
  const username = String(name || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,32}$/.test(username)) {
    throw new AuthError(400, 'Benutzername: 2–32 Zeichen, nur Buchstaben, Ziffern, Punkt, Minus oder Unterstrich');
  }
  return username;
}

// ------------------------------------------------------------------ accounts

/** On first start (or after an update from a version without accounts) the existing data becomes the admin's. */
export async function ensureAdmin() {
  let admin = await central.users.findOne({ prefix: '' });
  if (!admin) {
    const doc = { username: 'admin', displayName: 'Admin', role: 'admin', prefix: '', passwordHash: null, createdAt: new Date() };
    doc._id = (await central.users.insertOne(doc)).insertedId;
    admin = doc;
    console.log('Created the admin account "admin" for the existing library');
  }
  setFallbackTenant(tenantFor(admin));
  return admin;
}

export async function listUsers() {
  return central.users.find({}).sort({ createdAt: 1 }).toArray();
}

/**
 * Runs a background job once in every account's area; an error in one account doesn't stop the others.
 * Returns true if the job returned something truthy for any account.
 */
export async function forEachUser(job, label = 'Background job') {
  let any = false;
  for (const user of await listUsers()) {
    try {
      if (await withTenant(tenantFor(user), job)) any = true;
    } catch (err) {
      console.error(`${label} (${user.username}): ${err.message}`);
    }
  }
  return any;
}

/** Creates the folders and indexes of every account (at start and when an account is added). */
export async function prepareUser(user) {
  const tenant = tenantFor(user);
  await fs.mkdir(tenant.videoDir, { recursive: true });
  await fs.mkdir(tenant.posterDir, { recursive: true });
  await fs.mkdir(tenant.subtitleDir, { recursive: true });
  await fs.mkdir(tenant.thumbnailDir, { recursive: true });
  await fs.mkdir(tenant.transcodeDir, { recursive: true });
  await withTenant(tenant, prepareUserDb);
}

export async function createUser({ username, displayName, password }) {
  const name = normalizeUsername(username);
  if (password) checkPassword(password);
  if (await central.users.findOne({ username: name })) throw new AuthError(409, 'Diesen Benutzernamen gibt es schon');
  const _id = new ObjectId();
  const user = {
    _id,
    username: name,
    displayName: String(displayName || '').trim() || name,
    role: 'user',
    // own collections: u<id>_movies, u<id>_shows, ...
    prefix: `u${_id}_`,
    passwordHash: password ? await hashPassword(password) : null,
    createdAt: new Date(),
  };
  await central.users.insertOne(user);
  await prepareUser(user);
  return user;
}

/** Deletes an account with all its movies, series, playlists and settings. */
export async function deleteUser(user) {
  if (!user.prefix) throw new AuthError(400, 'Das erste Admin-Konto kann nicht gelöscht werden');
  await central.tokens.deleteMany({ userId: user._id });
  await central.invites.deleteMany({ userId: user._id });
  await central.users.deleteOne({ _id: user._id });
  await dropUserDb(user.prefix);
  const tenant = tenantFor(user);
  await fs.rm(tenant.mediaDir, { recursive: true, force: true });
  await fs.rm(tenant.backupDir, { recursive: true, force: true });
}

export async function updateProfile(user, { username, displayName }) {
  const update = {};
  if (username !== undefined) {
    const name = normalizeUsername(username);
    const other = await central.users.findOne({ username: name, _id: { $ne: user._id } });
    if (other) throw new AuthError(409, 'Diesen Benutzernamen gibt es schon');
    update.username = name;
  }
  if (displayName !== undefined) update.displayName = String(displayName).trim() || user.username;
  if (Object.keys(update).length) await central.users.updateOne({ _id: user._id }, { $set: update });
  return central.users.findOne({ _id: user._id });
}

/** Own password: the current one is needed if there is one. An admin resetting someone else's passes force. */
export async function setPassword(user, { current, password }, { force = false } = {}) {
  checkPassword(password);
  if (!force && user.passwordHash && !(await passwordMatches(String(current || ''), user.passwordHash))) {
    throw new AuthError(403, 'Das bisherige Passwort stimmt nicht');
  }
  await central.users.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(password) } });
  // an admin reset logs the account out everywhere
  if (force) await central.tokens.deleteMany({ userId: user._id });
}

// ------------------------------------------------------------------ login

/** A login token for one device; only its hash is stored. */
export async function issueToken(user, device) {
  const token = newSecret();
  await central.tokens.insertOne({
    _id: sha256(token),
    userId: user._id,
    device: String(device || 'Gerät').slice(0, 80),
    createdAt: new Date(),
    lastUsedAt: new Date(),
  });
  return token;
}

// a few wrong passwords are fine, a guessing script is not: 10 failures per address in 15 minutes
const failures = new Map();
const FAILURE_WINDOW_MS = 15 * 60_000;

function checkRateLimit(key) {
  const entry = failures.get(key);
  if (entry && entry.until > Date.now() && entry.count >= 10) {
    throw new AuthError(429, 'Zu viele Fehlversuche – bitte in 15 Minuten noch einmal');
  }
}

function recordFailure(key) {
  const entry = failures.get(key);
  if (!entry || entry.until < Date.now()) failures.set(key, { count: 1, until: Date.now() + FAILURE_WINDOW_MS });
  else entry.count++;
}

export async function login({ username, password, device }, address) {
  checkRateLimit(address);
  const user = await central.users.findOne({ username: String(username || '').trim().toLowerCase() });
  if (!user || !(await passwordMatches(String(password || ''), user.passwordHash))) {
    recordFailure(address);
    throw new AuthError(401, 'Benutzername oder Passwort falsch');
  }
  return { token: await issueToken(user, device), user };
}

export async function logout(token) {
  await central.tokens.deleteOne({ _id: sha256(token) });
}

/** The account behind a token: a device token, or API_TOKEN from the .env for the first admin. */
export async function userForToken(token) {
  if (!token) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(config.apiToken);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return central.users.findOne({ prefix: '' });
  const entry = await central.tokens.findOneAndUpdate(
    { _id: sha256(token) },
    { $set: { lastUsedAt: new Date() } },
    { returnDocument: 'after' },
  );
  return entry ? central.users.findOne({ _id: entry.userId }) : null;
}

// ------------------------------------------------------------------ invitations

/** A one-time code that logs a new phone into the account (valid for 7 days). */
export async function createInvite(user) {
  const code = newSecret();
  await central.invites.deleteMany({ userId: user._id });
  await central.invites.insertOne({
    _id: sha256(code),
    userId: user._id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  });
  return code;
}

export async function acceptInvite({ code, device }, address) {
  checkRateLimit(address);
  const invite = await central.invites.findOneAndDelete({ _id: sha256(String(code || '')), expiresAt: { $gt: new Date() } });
  const user = invite && (await central.users.findOne({ _id: invite.userId }));
  if (!user) {
    recordFailure(address);
    throw new AuthError(401, 'Die Einladung ist ungültig oder abgelaufen – bitte eine neue erstellen lassen');
  }
  return { token: await issueToken(user, device), user };
}

/**
 * A new server token (API_TOKEN): written to the .env the server was started with, the old one stops
 * working right away. Phones logged in with their own device login are not affected.
 */
export async function rotateServerToken() {
  const envFile = process.env.MOVIEBOX_ENV_FILE
    || process.execArgv.find((a) => a.startsWith('--env-file='))?.slice('--env-file='.length);
  if (!envFile) throw new AuthError(500, 'Die .env-Datei des Servers ist unbekannt');
  const fresh = crypto.randomBytes(32).toString('hex');
  let text;
  try {
    text = await fs.readFile(envFile, 'utf8');
  } catch {
    throw new AuthError(500, 'Die .env-Datei konnte nicht gelesen werden');
  }
  const updated = /^API_TOKEN=.*$/m.test(text) ? text.replace(/^API_TOKEN=.*$/m, `API_TOKEN=${fresh}`) : `${text.trimEnd()}\nAPI_TOKEN=${fresh}\n`;
  const tmp = `${envFile}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmp, updated, { mode: 0o600 });
    await fs.rename(tmp, envFile);
  } catch {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw new AuthError(500, 'Die .env-Datei konnte nicht geschrieben werden');
  }
  // only once it is saved: otherwise a restart would bring back the old one
  config.apiToken = fresh;
  return fresh;
}
