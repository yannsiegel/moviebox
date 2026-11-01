// Failed jobs grouped by their cause, so a long list of failures can be handled in a few taps.
// (Full download/import pipeline comes in a later stage; this file sets the pattern for job errors.)
import { db } from './db.js';
import { config } from './config.js';

/** Checked in this order; the first match wins. */
export const FAILURE_GROUPS = [
  {
    id: 'blocked',
    label: 'Von der Quelle blockiert',
    hint: 'Die Quelle hält den Server für einen Bot. Wird nach ein paar Stunden automatisch wiederholt.',
    test: /sign in to confirm|not a bot|http error 429|too many requests|try again later/i,
  },
  {
    id: 'unavailable',
    label: 'Video nicht verfügbar',
    hint: 'Gelöscht oder am Standort des Servers gesperrt.',
    test: /video unavailable|is not available|isn't available|nicht verfügbar|private video|has been removed|copyright/i,
  },
  {
    id: 'tmdbMiss',
    label: 'Keine Metadaten gefunden',
    hint: 'TMDB kennt diesen Titel nicht. Du kannst in den Details einen Treffer von Hand zuweisen.',
    test: /no tmdb match|tmdb miss/i,
  },
  {
    id: 'format',
    label: 'Format nicht lesbar',
    hint: 'ffprobe konnte die Datei nicht lesen. Vermutlich unvollständig oder in einem seltenen Container.',
    test: /invalid data|moov atom not found|does not contain any stream/i,
  },
  { id: 'other', label: 'Sonstige Fehler', hint: '', test: /./ },
];

export function failureGroup(error) {
  return (FAILURE_GROUPS.find((g) => g.test.test(error || '')) || FAILURE_GROUPS.at(-1)).id;
}

/** How often a blocked download is retried automatically. */
const AUTO_RETRIES = 2;

/**
 * The source's bot block is usually gone after a few hours: blocked jobs of the current account are
 * queued again by themselves (at most twice each), without anyone tapping "Wiederholen". Returns how many.
 */
export async function retryBlocked(now = new Date()) {
  const before = new Date(now.getTime() - config.autoRetryHours * 3_600_000);
  const failed = await db.jobs
    .find({ status: 'failed', updatedAt: { $lte: before }, $or: [{ autoRetries: { $exists: false } }, { autoRetries: { $lt: AUTO_RETRIES } }] })
    .toArray();
  const blocked = failed.filter((j) => failureGroup(j.error) === 'blocked');
  for (const job of blocked) {
    await db.jobs.updateOne(
      { _id: job._id, status: 'failed' },
      { $set: { status: 'queued', error: null, createdAt: now, updatedAt: now }, $inc: { autoRetries: 1 } },
    );
  }
  return blocked.length;
}
