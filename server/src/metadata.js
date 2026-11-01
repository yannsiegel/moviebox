// The metadata worker turns scanner jobs into library rows.
//
// For every queued job it:
//   1. Reads the file with ffprobe to get duration, codecs, streams.
//   2. Parses the filename to guess movie-vs-episode and title/year/season/episode.
//   3. Optionally asks TMDB for a better title, overview, poster and backdrop.
//   4. Writes a row into db.movies or db.episodes (creating db.shows on demand).
//   5. Looks for sidecar subtitles beside the file (.srt, .ass, .vtt).
//
// Each step has a stepVersion; a bump re-runs the step on existing items. One job runs at a time
// per tenant (CPU-only ffprobe is cheap enough that concurrency doesn't buy much here, and TMDB
// has its own rate limit).

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { events } from './events.js';
import { activeTenant } from './tenant.js';
import { forEachUser } from './users.js';
import { probe } from './ffprobe.js';
import { parseFilename } from './parse-filename.js';
import { backdropUrl, episodeDetails, isConfigured as tmdbEnabled, movieDetails, posterUrl, searchMovie, searchShow, showDetails } from './tmdb.js';
import { failureGroup } from './failures.js';

const STEP_VERSION = 1;

const SUBTITLE_EXT = ['.srt', '.ass', '.vtt', '.sub'];

async function findSidecarSubtitles(absolute) {
  const dir = path.dirname(absolute);
  const stem = path.basename(absolute, path.extname(absolute));
  let entries;
  try { entries = await fs.readdir(dir); } catch { return []; }
  return entries
    .filter((f) => f.startsWith(stem) && SUBTITLE_EXT.includes(path.extname(f).toLowerCase()))
    .map((f) => {
      // "Movie.de.srt" -> language 'de'
      const rest = f.slice(stem.length).replace(/^[-_. ]+/, '').replace(path.extname(f), '');
      const lang = rest.match(/^([a-z]{2,3})(?:[-_.].*)?$/i)?.[1]?.toLowerCase() || '';
      return { file: path.join(dir, f), language: lang };
    });
}

/** Insert or update a show (series parent) row. */
async function upsertShow({ title, year, tmdbId, tmdbData, sourceId }) {
  const update = {
    $setOnInsert: { sourceId, source: 'local', createdAt: new Date() },
    $set: {
      title,
      year: year || null,
      tmdbId: tmdbId || null,
      poster: tmdbData ? posterUrl(tmdbData.poster_path) : null,
      backdrop: tmdbData ? backdropUrl(tmdbData.backdrop_path) : null,
      overview: tmdbData?.overview || '',
      genres: tmdbData?.genres?.map((g) => g.name) || [],
      updatedAt: new Date(),
      stepVersion: STEP_VERSION,
    },
  };
  await db.shows.updateOne({ sourceId }, update, { upsert: true });
  return db.shows.findOne({ sourceId });
}

async function processMovie(job, parsed, media) {
  let title = parsed.title || parsed.cleanName;
  let year = parsed.year;
  let tmdb = null;
  let tmdbId = null;

  if (tmdbEnabled() && title) {
    try {
      const hit = await searchMovie(title, year);
      if (hit) {
        tmdbId = hit.id;
        tmdb = await movieDetails(hit.id);
        title = tmdb?.title || hit.title || title;
        if (tmdb?.release_date) year = Number(tmdb.release_date.slice(0, 4)) || year;
      }
    } catch (err) {
      console.warn(`[metadata] TMDB movie lookup failed for "${title}": ${err.message}`);
    }
  }

  const subs = await findSidecarSubtitles(job.payload.absolute);
  await db.movies.updateOne(
    { sourceId: job.sourceId },
    {
      $setOnInsert: { sourceId: job.sourceId, source: job.sourceUrl ? 'download' : 'local', createdAt: new Date() },
      $set: {
        title,
        year: year || null,
        tmdbId,
        overview: tmdb?.overview || '',
        genres: tmdb?.genres?.map((g) => g.name) || [],
        poster: posterUrl(tmdb?.poster_path),
        backdrop: backdropUrl(tmdb?.backdrop_path),
        runtimeSec: media.durationSec,
        media,
        subtitles: subs,
        path: job.payload.relative,
        sizeBytes: job.payload.sizeBytes,
        preview: Boolean(job.preview),
        previewExpiresAt: job.previewExpiresAt || null,
        sourceUrl: job.sourceUrl || null,
        updatedAt: new Date(),
        addedAt: new Date(),
        stepVersion: STEP_VERSION,
      },
    },
    { upsert: true },
  );
}

async function processEpisode(job, parsed, media) {
  // show
  let showTmdbId = null;
  let showData = null;
  if (tmdbEnabled() && parsed.showTitle) {
    try {
      const hit = await searchShow(parsed.showTitle);
      if (hit) {
        showTmdbId = hit.id;
        showData = await showDetails(hit.id);
      }
    } catch (err) {
      console.warn(`[metadata] TMDB show lookup failed for "${parsed.showTitle}": ${err.message}`);
    }
  }
  // one show row per (showTitle, tmdbId) — the sourceId is the title+tmdb hash, not the file hash
  const showSourceId = `show:${parsed.showTitle.toLowerCase()}:${showTmdbId ?? 'none'}`;
  const show = await upsertShow({
    title: showData?.name || parsed.showTitle,
    year: showData?.first_air_date ? Number(showData.first_air_date.slice(0, 4)) : null,
    tmdbId: showTmdbId,
    tmdbData: showData,
    sourceId: showSourceId,
  });

  // episode
  let episodeTitle = parsed.title || '';
  let episodeOverview = '';
  let still = null;
  if (tmdbEnabled() && showTmdbId) {
    try {
      const ep = await episodeDetails(showTmdbId, parsed.season, parsed.episode);
      if (ep) {
        episodeTitle = ep.name || episodeTitle;
        episodeOverview = ep.overview || '';
        still = posterUrl(ep.still_path, 'w500');
      }
    } catch (err) {
      console.warn(`[metadata] TMDB episode lookup failed for S${parsed.season}E${parsed.episode}: ${err.message}`);
    }
  }

  const subs = await findSidecarSubtitles(job.payload.absolute);
  await db.episodes.updateOne(
    { sourceId: job.sourceId },
    {
      $setOnInsert: { sourceId: job.sourceId, source: job.sourceUrl ? 'download' : 'local', createdAt: new Date() },
      $set: {
        showId: show._id,
        showTitle: show.title,
        season: parsed.season,
        episode: parsed.episode,
        title: episodeTitle,
        overview: episodeOverview,
        still,
        runtimeSec: media.durationSec,
        media,
        subtitles: subs,
        path: job.payload.relative,
        sizeBytes: job.payload.sizeBytes,
        preview: Boolean(job.preview),
        previewExpiresAt: job.previewExpiresAt || null,
        sourceUrl: job.sourceUrl || null,
        updatedAt: new Date(),
        addedAt: new Date(),
        stepVersion: STEP_VERSION,
      },
    },
    { upsert: true },
  );
}

async function processJob(job) {
  await db.jobs.updateOne({ _id: job._id }, { $set: { status: 'running', updatedAt: new Date() } });

  const media = await probe(job.payload.absolute);
  const parsed = parseFilename(job.payload.absolute);

  if (parsed.kind === 'episode') await processEpisode(job, parsed, media);
  else await processMovie(job, parsed, media);

  await db.jobs.updateOne({ _id: job._id }, { $set: { status: 'done', error: null, updatedAt: new Date() } });
}

async function processQueued() {
  const tenant = activeTenant();
  if (!tenant) return false;
  const job = await db.jobs.findOne({ kind: 'scan-local', status: 'queued' }, { sort: { createdAt: 1 } });
  if (!job) return false;
  try {
    await processJob(job);
  } catch (err) {
    console.error(`[metadata] ${tenant.user.username} ${job.payload?.relative}: ${err.message}`);
    await db.jobs.updateOne(
      { _id: job._id },
      { $set: { status: 'failed', error: err.message, group: failureGroup(err.message), updatedAt: new Date() } },
    );
  }
  return true;
}

/** The worker's main loop: one job at a time across all tenants, keeps going while anything is queued. */
async function tick() {
  try {
    const any = await forEachUser(processQueued, 'Metadata');
    if (any) {
      setImmediate(tick);
      return;
    }
  } catch (err) {
    console.error(`Metadata loop: ${err.message}`);
  }
  // nothing to do - wait for the scanner to push again or sleep a bit
  setTimeout(tick, 15_000);
}

export function startMetadataWorker() {
  setTimeout(() => {
    events.on('scan-done', () => setImmediate(tick));
    tick();
  }, config.workerStartDelayMs);
}
