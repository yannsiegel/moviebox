// REST API under /api. First-stage scope: auth, accounts, invites, server status.
// Library endpoints (movies, shows, episodes, playback) are added in the next stage once the
// scanner and metadata worker land.

import express from 'express';
import { AuthError, acceptInvite, createInvite, createUser, deleteUser, listUsers, login, logout, publicUser, rotateServerToken, setPassword, updateProfile, userForToken } from './users.js';
import { tenantFor } from './users.js';
import { withTenant } from './tenant.js';

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
  // media streaming uses ?token= because <video> can't set headers
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
  res.json({
    version: process.env.npm_package_version || 'dev',
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  });
}));

// ------------------------------------------------------------------ errors

api.use((err, _req, res, _next) => {
  if (err instanceof AuthError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler' });
});
