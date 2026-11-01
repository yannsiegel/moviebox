// Dispatches a URL/magnet to the right source backend, and aggregates search across them.
//
// Backends:
//  - direct   plain http(s) link to .mp4/.mkv
//  - torrent  magnet links (via webtorrent, optional dep)
//  - archive  archive.org titles (via yt-dlp)
//  - ytdlp    catch-all for everything else (youtube, vimeo, …; ~1800 sites)
//
// torrentio is a *search* backend only (returns magnet links that `torrent` then downloads);
// archive is both a search and a download backend.

import * as direct from './direct.js';
import * as torrent from './torrent.js';
import * as archive from './archive.js';
import * as ytdlp from './ytdlp.js';
import * as torrentio from './torrentio.js';

/** URL dispatch for downloads. Order matters: specific (magnet, direct, archive) before catch-all. */
const DOWNLOAD_BACKENDS = [torrent, archive, direct, ytdlp];

export function pickBackend(url) {
  for (const b of DOWNLOAD_BACKENDS) if (b.matches(url)) return b;
  return null;
}

export async function probe(url) {
  const backend = pickBackend(url);
  if (!backend) throw new Error('Keine Quelle für diese URL gefunden');
  if (backend === torrent) {
    const m = url.match(/dn=([^&]+)/);
    const name = m ? decodeURIComponent(m[1]) : 'Torrent';
    return { backend: 'torrent', kind: 'video', title: name, durationSec: null, sizeBytes: null, sourceUrl: url };
  }
  if (backend === direct) {
    const info = await direct.probe(url);
    return {
      backend: 'direct', kind: info.kind === 'video' ? 'video' : 'unknown',
      title: info.filename.replace(/\.[^.]+$/, ''), durationSec: null,
      sizeBytes: info.sizeBytes, sourceUrl: info.finalUrl, filename: info.filename,
    };
  }
  // archive and ytdlp both go through ytdlp.probe
  const info = await ytdlp.probe(url);
  return {
    backend: backend === archive ? 'archive' : 'ytdlp',
    kind: info.kind, title: info.title, uploader: info.uploader,
    durationSec: info.durationSec, sizeBytes: null, sourceUrl: info.sourceUrl,
    extractor: info.extractor, thumbnail: info.thumbnail, year: info.year,
  };
}

export async function download(url, targetDir, opts) {
  const backend = pickBackend(url);
  if (!backend) throw new Error('Keine Quelle für diese URL gefunden');
  return backend.download(url, targetDir, opts);
}

/**
 * Aggregate discovery across every backend that supports search. Takes a TMDB id (and kind,
 * season, episode for series) plus a free-text title. Returns a flat list of sources, each
 * with a backend tag so the UI can mark them (torrent / archive / etc.).
 */
export async function searchSources({ tmdbId, kind, season, episode, title, year }) {
  const results = [];
  // archive.org by free-text
  if (title) {
    try {
      const archiveHits = await archive.search(title, { limit: 10 });
      for (const h of archiveHits) results.push({ ...h, backend: 'archive' });
    } catch (err) {
      console.warn(`[sources] archive search: ${err.message}`);
    }
  }
  // torrentio by TMDB -> IMDB
  if (tmdbId && kind) {
    try {
      const torrentioHits = await torrentio.search({ tmdbId, kind, season, episode });
      // show at most 12 torrent sources; the top ones are the best-seeded
      for (const h of torrentioHits.slice(0, 12)) results.push({ ...h, backend: 'torrentio' });
    } catch (err) {
      console.warn(`[sources] torrentio: ${err.message}`);
    }
  }
  return results;
}

export async function capabilities() {
  return {
    torrent: await torrent.available(),
  };
}

export { direct, torrent, archive, ytdlp, torrentio };
