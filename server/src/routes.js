// REST API under /api.
//
// Stage 1: auth, accounts, invites, server status.
// Stage 2 (this file): library (movies, shows, episodes), streaming, resume positions, "Weiter schauen",
// a manual "scan now" and job status for the admin.

import express from 'express';
import { db, serialize, toObjectId } from './db.js';
import { AuthError, acceptInvite, createInvite, createUser, deleteUser, listUsers, login, logout, publicUser, rotateServerToken, setPassword, updateProfile, userForToken } from './users.js';
import { tenantFor } from './users.js';
import { withTenant } from './tenant.js';
import { scanAll } from './scanner.js';
import { findMedia, serveMedia } from './stream.js';

export const api = express.Router();
api.use(express.json({ limit: '1mb' }));

// ------------------------------------------------------------------ helpers

function clientAddress(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function bearerToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  if (typeof req.query?.token === 'string') return req.query.token;
  return null;
}

function requireAuth() {
  return async (req, res, next) => {
    try {
      const user = await userForToken(bearerToken(req));
      if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
      req.user = user;
      req.tenant = tenantFor(user);
      withTenant(req.tenant, () => next());
    } catch (err) { next(err); }
  };
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Nur für Admins' });
  next();
}

function handle(fn) {
  return async (req, res, next) => {
    try { await fn(req, res); }
    catch (err) { next(err); }
  };
}

// ------------------------------------------------------------------ public

api.get('/health', (_req, res) => {
  res.json({ ok: true, version: process.env.npm_package_version || 'dev' });
});

api.post('/login', handle(async (req, res) => {
  const { token, user } = await login(req.body || {}, clientAddress(req));
  res.json({ token, user: publicUser(user) });
}));

api.post('/invite/accept', handle(async (req, res) => {
  const { token, user } = await acceptInvite(req.body || {}, clientAddress(req));
  res.json({ token, user: publicUser(user) });
}));

// ------------------------------------------------------------------ authed

api.use(requireAuth());

api.get('/me', handle(async (req, res) => {
  res.json({ user: publicUser(req.user) });
}));

api.post('/logout', handle(async (req, res) => {
  await logout(bearerToken(req));
  res.json({ ok: true });
}));

api.patch('/me', handle(async (req, res) => {
  const user = await updateProfile(req.user, req.body || {});
  res.json({ user: publicUser(user) });
}));

api.post('/me/password', handle(async (req, res) => {
  await setPassword(req.user, req.body || {});
  res.json({ ok: true });
}));

api.post('/me/invite', handle(async (req, res) => {
  const code = await createInvite(req.user);
  res.json({ code });
}));

// ------------------------------------------------------------------ library

/** Compact movie/episode shape for list views. */
function listMovie(m) {
  const s = serialize(m);
  return { id: s.id, title: s.title, year: s.year, poster: s.poster, runtimeSec: s.runtimeSec, addedAt: s.addedAt, kind: 'movie' };
}
function listEpisode(e) {
  const s = serialize(e);
  return {
    id: s.id, showId: String(s.showId), showTitle: s.showTitle, season: s.season, episode: s.episode,
    title: s.title, still: s.still, runtimeSec: s.runtimeSec, addedAt: s.addedAt, kind: 'episode',
  };
}
function listShow(s) {
  const d = serialize(s);
  return { id: d.id, title: d.title, year: d.year, poster: d.poster, overview: d.overview };
}

api.get('/library/summary', handle(async (_req, res) => {
  const [movieCount, showCount, episodeCount] = await Promise.all([
    db.movies.countDocuments(),
    db.shows.countDocuments(),
    db.episodes.countDocuments(),
  ]);
  res.json({ movies: movieCount, shows: showCount, episodes: episodeCount });
}));

api.get('/movies', handle(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const sort = req.query.sort === 'title' ? { title: 1 } : { addedAt: -1 };
  const movies = await db.movies.find({}).sort(sort).limit(limit).toArray();
  res.json({ movies: movies.map(listMovie) });
}));

api.get('/movies/:id', handle(async (req, res) => {
  const movie = await db.movies.findOne({ _id: toObjectId(req.params.id) });
  if (!movie) return res.status(404).json({ error: 'Film nicht gefunden' });
  res.json({ movie: serialize(movie) });
}));

api.get('/shows', handle(async (_req, res) => {
  const shows = await db.shows.find({}).sort({ title: 1 }).toArray();
  res.json({ shows: shows.map(listShow) });
}));

api.get('/shows/:id', handle(async (req, res) => {
  const show = await db.shows.findOne({ _id: toObjectId(req.params.id) });
  if (!show) return res.status(404).json({ error: 'Serie nicht gefunden' });
  const episodes = await db.episodes.find({ showId: show._id }).sort({ season: 1, episode: 1 }).toArray();
  const seasons = {};
  for (const ep of episodes) (seasons[ep.season] ||= []).push(listEpisode(ep));
  res.json({ show: serialize(show), seasons });
}));

api.get('/episodes/:id', handle(async (req, res) => {
  const episode = await db.episodes.findOne({ _id: toObjectId(req.params.id) });
  if (!episode) return res.status(404).json({ error: 'Folge nicht gefunden' });
  res.json({ episode: serialize(episode) });
}));

// "Weiter schauen" + "Neu hinzugefügt" for the home screen.
api.get('/home', handle(async (_req, res) => {
  const [resume, recentMovies, recentEpisodes] = await Promise.all([
    db.resume.find({ positionSec: { $gt: 15 }, completed: { $ne: true } }).sort({ updatedAt: -1 }).limit(20).toArray(),
    db.movies.find({}).sort({ addedAt: -1 }).limit(12).toArray(),
    db.episodes.find({}).sort({ addedAt: -1 }).limit(12).toArray(),
  ]);
  // hydrate resume rows into their media items so the client needs one request, not twenty
  const continueItems = [];
  for (const r of resume) {
    const movie = await db.movies.findOne({ _id: r.mediaId });
    if (movie) { continueItems.push({ ...listMovie(movie), positionSec: r.positionSec }); continue; }
    const episode = await db.episodes.findOne({ _id: r.mediaId });
    if (episode) continueItems.push({ ...listEpisode(episode), positionSec: r.positionSec });
  }
  res.json({
    continue: continueItems,
    recentMovies: recentMovies.map(listMovie),
    recentEpisodes: recentEpisodes.map(listEpisode),
  });
}));

// ------------------------------------------------------------------ playback & resume

api.get('/media/:id/stream', handle(async (req, res) => {
  const item = await findMedia(req.params.id);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  await serveMedia(req, res, item);
}));

api.get('/media/:id/subtitles/:index', handle(async (req, res) => {
  const item = await findMedia(req.params.id);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  const sub = item.subtitles?.[Number(req.params.index)];
  if (!sub) return res.status(404).json({ error: 'Untertitel nicht gefunden' });
  res.sendFile(sub.file);
}));

api.get('/media/:id/resume', handle(async (req, res) => {
  const row = await db.resume.findOne({ mediaId: toObjectId(req.params.id) });
  res.json({ positionSec: row?.positionSec || 0, completed: Boolean(row?.completed) });
}));

api.post('/media/:id/resume', handle(async (req, res) => {
  const positionSec = Math.max(0, Number(req.body?.positionSec) || 0);
  const durationSec = Math.max(0, Number(req.body?.durationSec) || 0);
  // standard convention: anything past 90 % counts as watched
  const completed = durationSec > 0 && positionSec >= durationSec * 0.9;
  await db.resume.updateOne(
    { mediaId: toObjectId(req.params.id) },
    {
      $set: { positionSec, durationSec, completed, updatedAt: new Date() },
      $setOnInsert: { mediaId: toObjectId(req.params.id), createdAt: new Date() },
    },
    { upsert: true },
  );
  if (completed) {
    await db.plays.insertOne({ mediaId: toObjectId(req.params.id), at: new Date(), durationSec });
  }
  res.json({ ok: true, completed });
}));

// ------------------------------------------------------------------ admin

api.get('/admin/users', requireAdmin, handle(async (_req, res) => {
  res.json({ users: (await listUsers()).map(publicUser) });
}));

api.post('/admin/users', requireAdmin, handle(async (req, res) => {
  const user = await createUser(req.body || {});
  res.status(201).json({ user: publicUser(user) });
}));

api.delete('/admin/users/:id', requireAdmin, handle(async (req, res) => {
  const target = (await listUsers()).find((u) => String(u._id) === req.params.id);
  if (!target) return res.status(404).json({ error: 'Konto nicht gefunden' });
  await deleteUser(target);
  res.json({ ok: true });
}));

api.post('/admin/users/:id/password', requireAdmin, handle(async (req, res) => {
  const target = (await listUsers()).find((u) => String(u._id) === req.params.id);
  if (!target) return res.status(404).json({ error: 'Konto nicht gefunden' });
  await setPassword(target, req.body || {}, { force: true });
  res.json({ ok: true });
}));

api.post('/admin/server-token/rotate', requireAdmin, handle(async (_req, res) => {
  const token = await rotateServerToken();
  res.json({ token });
}));

api.get('/admin/status', requireAdmin, handle(async (_req, res) => {
  const jobs = await db.jobs.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray();
  res.json({
    version: process.env.npm_package_version || 'dev',
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    jobs: Object.fromEntries(jobs.map((j) => [j._id, j.count])),
  });
}));

api.post('/admin/scan', requireAdmin, handle(async (_req, res) => {
  // the scan runs across every tenant, so it leaves the current withTenant context behind
  scanAll().catch((err) => console.error(`Manual scan: ${err.message}`));
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ errors

api.use((err, _req, res, _next) => {
  if (err instanceof AuthError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler' });
});
