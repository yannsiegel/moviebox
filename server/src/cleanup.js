// Deletes expired preview files. Runs hourly: finds every movie/episode with a previewExpiresAt
// in the past, removes the file, and lets the next scan sweep its DB row.

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { activeTenant } from './tenant.js';
import { forEachUser } from './users.js';

async function expireOne() {
  const tenant = activeTenant();
  if (!tenant) return false;
  const now = new Date();
  const movies = await db.movies.find({ preview: true, previewExpiresAt: { $lte: now } }).toArray();
  const episodes = await db.episodes.find({ preview: true, previewExpiresAt: { $lte: now } }).toArray();
  let removed = 0;
  for (const item of [...movies, ...episodes]) {
    const file = path.join(tenant.videoDir, item.path);
    await fs.rm(file, { force: true }).catch(() => {});
    removed++;
  }
  if (removed) console.log(`[cleanup] ${tenant.user.username}: ${removed} preview-dateien gelöscht`);
  return removed > 0;
}

export async function expireAll() {
  await forEachUser(expireOne, 'Cleanup');
}

export function startCleanup() {
  const HOUR_MS = 3_600_000;
  setTimeout(async function tick() {
    try { await expireAll(); } catch (err) { console.error(`Cleanup: ${err.message}`); }
    setTimeout(tick, HOUR_MS);
  }, config.workerStartDelayMs);
}
