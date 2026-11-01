// Series subscriptions ("set and forget"). The user hits "Abonnieren" on a show,
// MovieBox stores the show's TMDB id and periodically checks TMDB for newly
// aired episodes. Any episode that aired on or before today but isn't in the
// user's library yet gets scheduled: TorrentIO is asked for the best magnet,
// the download queue takes over, and the result lands in videoDir just like
// any manual download.
//
// This is the pattern Sonarr formalised; we keep it light: no quality
// profiles yet, no release groups, just "the best-seeded source wins".

import { config } from './config.js';
import { db } from './db.js';
import { events } from './events.js';
import { activeTenant } from './tenant.js';
import { forEachUser } from './users.js';
import * as torrentio from './sources/torrentio.js';
import { showDetails, seasonDetails, isConfigured as tmdbEnabled } from './tmdb.js';

const CHECK_INTERVAL_MS = 6 * 3_600_000;

/** Enumerates (season, episode, airDate) tuples that TMDB currently lists for a show. */
async function airedEpisodes(tmdbShowId) {
  const show = await showDetails(tmdbShowId);
  if (!show?.seasons) return [];
  const out = [];
  const today = new Date().toISOString().slice(0, 10);
  // skip season 0 (specials)
  for (const season of show.seasons.filter((s) => s.season_number > 0)) {
    const detail = await seasonDetails(tmdbShowId, season.season_number);
    for (const ep of detail?.episodes || []) {
      if (!ep.air_date || ep.air_date > today) continue;
      out.push({ season: season.season_number, episode: ep.episode_number, airDate: ep.air_date, name: ep.name });
    }
  }
  return out;
}

/** For one tenant: step through every subscription, queue missing episodes. */
async function checkOne() {
  const tenant = activeTenant();
  if (!tenant) return false;
  if (!tmdbEnabled()) return false;
  const subs = await db.subscriptions.find({}).toArray();
  let queued = 0;
  for (const sub of subs) {
    if (!sub.tmdbId) continue;
    try {
      const aired = await airedEpisodes(sub.tmdbId);
      const have = await db.episodes.find({ showId: sub.showId }).project({ season: 1, episode: 1 }).toArray();
      const haveSet = new Set(have.map((e) => `${e.season}:${e.episode}`));
      const missing = aired.filter((a) => !haveSet.has(`${a.season}:${a.episode}`));
      for (const want of missing) {
        // avoid queueing the same episode twice
        const already = await db.jobs.findOne({
          kind: 'download-url',
          'payload.subscriptionId': String(sub._id),
          'payload.season': want.season,
          'payload.episode': want.episode,
          status: { $in: ['queued', 'running'] },
        });
        if (already) continue;

        // best magnet via TorrentIO (seeders desc, first entry)
        let hits;
        try {
          hits = await torrentio.search({ tmdbId: sub.tmdbId, kind: 'tv', season: want.season, episode: want.episode });
        } catch (err) {
          console.warn(`[subscriptions] torrentio ${sub.title} S${want.season}E${want.episode}: ${err.message}`);
          continue;
        }
        if (!hits.length) continue;
        const pick = hits[0];
        await db.jobs.insertOne({
          kind: 'download-url',
          status: 'queued',
          payload: {
            url: pick.magnet,
            mode: 'keep',
            subscriptionId: String(sub._id),
            showTitle: sub.title,
            season: want.season,
            episode: want.episode,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        queued++;
      }
      await db.subscriptions.updateOne({ _id: sub._id }, { $set: { lastCheckedAt: new Date() } });
    } catch (err) {
      console.warn(`[subscriptions] ${sub.title}: ${err.message}`);
    }
  }
  if (queued) {
    console.log(`[subscriptions] ${tenant.user.username}: ${queued} folge(n) in warteschlange gelegt`);
    events.emit('download-queued');
  }
  return queued > 0;
}

/** Run one pass across every tenant. */
export async function checkAll() {
  return forEachUser(checkOne, 'Subscriptions');
}

/** Start the periodic subscription check loop. First run after WORKER_START_DELAY_MS. */
export function startSubscriptions() {
  setTimeout(async function tick() {
    try { await checkAll(); } catch (err) { console.error(`Subscriptions loop: ${err.message}`); }
    setTimeout(tick, CHECK_INTERVAL_MS);
  }, config.workerStartDelayMs);
}
