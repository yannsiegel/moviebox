// Walks the video folder of the current tenant and compares against the DB.
// New files are queued for metadata processing; files whose mtime/size changed get re-queued;
// files that disappeared are removed from the library (the associated resume position stays —
// if the file comes back the user keeps their position).
//
// Scanning is deliberately simple: a recursive readdir with mtime+size as the change signal.
// inotify would be nicer but every filesystem has edge cases (NFS, bind mounts, SMB), so a
// scheduled scan + an explicit "scan now" API call is the robust baseline.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';
import { events } from './events.js';
import { activeTenant } from './tenant.js';
import { forEachUser } from './users.js';
import { isVideoFile } from './parse-filename.js';

const DAY_MS = 24 * 3_600_000;

/** Stable id derived from the relative path. Rename = new id (and that is correct — it is a new entry). */
export function sourceIdFor(relativePath) {
  return 'file:' + crypto.createHash('sha1').update(relativePath).digest('hex').slice(0, 20);
}

/** Walk one tenant's videoDir and yield absolute file paths. */
async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && isVideoFile(entry.name)) yield full;
  }
}

async function scanOne() {
  const tenant = activeTenant();
  if (!tenant) return false;

  await fs.mkdir(tenant.videoDir, { recursive: true });

  const seen = new Set();
  let newCount = 0;
  let changedCount = 0;

  for await (const absolute of walk(tenant.videoDir)) {
    const relative = path.relative(tenant.videoDir, absolute);
    const sourceId = sourceIdFor(relative);
    seen.add(sourceId);

    let stat;
    try { stat = await fs.stat(absolute); } catch { continue; }
    const sizeBytes = stat.size;
    const mtimeMs = Math.floor(stat.mtimeMs);

    // Movies and episodes share the "source" shape - we insert a placeholder with no kind yet
    // and let the metadata worker decide movie vs. episode after parse-filename + ffprobe.
    const inPreview = relative.startsWith('preview/') || relative.startsWith('preview' + path.sep);
    const previewExpiresAt = inPreview
      ? new Date(stat.mtimeMs + (config.previewKeepHours || 48) * 3_600_000)
      : null;

    const existing = await db.jobs.findOne({ sourceId });
    if (!existing) {
      await db.jobs.insertOne({
        sourceId,
        kind: 'scan-local',
        status: 'queued',
        payload: { relative, absolute, sizeBytes, mtimeMs },
        preview: inPreview,
        previewExpiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      newCount++;
      continue;
    }

    const changed = existing.payload?.sizeBytes !== sizeBytes || existing.payload?.mtimeMs !== mtimeMs;
    if (changed) {
      await db.jobs.updateOne(
        { _id: existing._id },
        { $set: { status: 'queued', error: null, payload: { relative, absolute, sizeBytes, mtimeMs }, updatedAt: new Date() } },
      );
      changedCount++;
    }
  }

  // files that vanished: drop them from movies/episodes (resume rows survive)
  const removedMovies = await db.movies.deleteMany({ sourceId: { $nin: Array.from(seen) }, source: 'local' });
  const removedEpisodes = await db.episodes.deleteMany({ sourceId: { $nin: Array.from(seen) }, source: 'local' });

  if (newCount || changedCount || removedMovies.deletedCount || removedEpisodes.deletedCount) {
    console.log(`[scanner] ${tenant.user.username}: +${newCount} new, ~${changedCount} changed, -${removedMovies.deletedCount + removedEpisodes.deletedCount} removed`);
    events.emit('scan-done');
  }
  return newCount + changedCount > 0;
}

/** Run one scan across every account. */
export async function scanAll() {
  return forEachUser(scanOne, 'Scanner');
}

/** Starts the periodic scan loop. The first run is after WORKER_START_DELAY_MS. */
export function startScanner() {
  setTimeout(async function tick() {
    try { await scanAll(); } catch (err) { console.error(`Scanner: ${err.message}`); }
    setTimeout(tick, config.scanIntervalSeconds * 1000);
  }, config.workerStartDelayMs);
}
