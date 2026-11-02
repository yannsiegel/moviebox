// Background worker that drains download-url jobs: for each queued job it picks the right source
// backend (direct URL, yt-dlp, ...), writes the file into videoDir (or videoDir/preview/ for
// "preview" mode items), then flags the resulting movie/episode row so the metadata worker
// and the UI know it's a stream that will be cleaned up later.
//
// One job at a time per tenant — big downloads shouldn't stampede the CPU or the disk.

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { events } from './events.js';
import { activeTenant } from './tenant.js';
import { forEachUser } from './users.js';
import { failureGroup } from './failures.js';
import * as sources from './sources/index.js';

const PREVIEW_SUBDIR = 'preview';

async function processOne() {
  const tenant = activeTenant();
  if (!tenant) return false;
  // Atomic claim: findOneAndUpdate flips queued -> running in one DB op so two
  // concurrent ticks can never grab the same job.
  const job = await db.jobs.findOneAndUpdate(
    { kind: 'download-url', status: 'queued' },
    { $set: { status: 'running', updatedAt: new Date() } },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
  if (!job) return false;

  const { url, mode, keepHours } = job.payload || {};
  const targetDir = mode === 'preview'
    ? path.join(tenant.videoDir, PREVIEW_SUBDIR)
    : tenant.videoDir;

  try {
    const result = await sources.download(url, targetDir, {
      onProgress: (p) => {
        // persist occasionally; progress updates every ~1s is enough
        if (!job._lastProgress || Date.now() - job._lastProgress > 1000) {
          job._lastProgress = Date.now();
          db.jobs.updateOne({ _id: job._id }, { $set: { progress: p, updatedAt: new Date() } }).catch(() => {});
        }
      },
    });

    const previewExpiresAt = mode === 'preview'
      ? new Date(Date.now() + (keepHours || config.previewKeepHours || 48) * 3_600_000)
      : null;

    // The scanner will pick the file up on its next tick. We give it a nudge, and attach the
    // preview flag directly so the first metadata upsert carries it (metadata.js reads from
    // the matching scan-local job's payload for the preview info).
    await db.jobs.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'done',
          error: null,
          result: { file: result.path, relative: path.relative(tenant.videoDir, result.path) },
          progress: { pct: 100 },
          preview: mode === 'preview',
          previewExpiresAt,
          updatedAt: new Date(),
        },
      },
    );
    // store an advice doc the metadata worker checks when it processes the matching file
    await db.jobs.updateOne(
      { kind: 'scan-local', 'payload.absolute': result.path },
      { $set: { preview: mode === 'preview', previewExpiresAt, sourceUrl: url } },
      { upsert: false },
    );
    events.emit('download-done');
    events.emit('scan-done');          // kick metadata processing
    return true;
  } catch (err) {
    console.error(`[downloader] ${tenant.user.username} ${url}: ${err.message}`);
    await db.jobs.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'failed',
          error: err.message,
          group: failureGroup(err.message),
          updatedAt: new Date(),
        },
      },
    );
    return true;
  }
}

let _ticking = false;
async function tick() {
  // Re-entrancy guard: subscription-check, upload, and manual add all emit
  // `download-queued`. Without this, several ticks run in parallel and race
  // to grab jobs — the downloads then compete for the same bandwidth and
  // nobody gets peers. One tick at a time; a new emit while already ticking
  // is coalesced by this flag.
  if (_ticking) return;
  _ticking = true;
  try {
    const any = await forEachUser(processOne, 'Downloader');
    if (any) { _ticking = false; setImmediate(tick); return; }
  } catch (err) {
    console.error(`Downloader loop: ${err.message}`);
  }
  _ticking = false;
  setTimeout(tick, 10_000);
}

export function startDownloader() {
  setTimeout(() => {
    events.on('download-queued', () => setImmediate(tick));
    tick();
  }, config.workerStartDelayMs);
}
