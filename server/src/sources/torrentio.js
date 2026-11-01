// TorrentIO is a public Stremio addon that aggregates magnet links from the
// public DHT for a given IMDB id (and season/episode for series). No auth,
// no API key; we just hit its JSON endpoint and parse the stream list.
//
//   https://torrentio.strem.fun/stream/movie/<imdb>.json
//   https://torrentio.strem.fun/stream/series/<imdb>:<season>:<episode>.json
//
// We need an IMDB id, so this backend takes a TMDB id and resolves it to IMDB
// first via the TMDB /find endpoint (free; TMDB_API_KEY required).

import { config } from '../config.js';

/** Resolve TMDB id -> IMDB id. The TMDB external-ids endpoint is the direct call. */
async function tmdbToImdb(tmdbId, kind) {
  if (!config.tmdbApiKey) throw new Error('TMDB-Key fehlt (nötig für IMDB-Lookup)');
  const path = kind === 'movie' ? `/movie/${tmdbId}/external_ids` : `/tv/${tmdbId}/external_ids`;
  const url = `${config.tmdbApi}${path}?api_key=${encodeURIComponent(config.tmdbApiKey)}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.imdb_id || null;
}

/** Parse TorrentIO's quasi-markdown title field into (quality, size, seeders, provider). */
function parseStream(stream) {
  const name = String(stream.name || '');
  const title = String(stream.title || '');
  // name looks like "Torrentio\n1080p"
  const quality = (name.match(/\b(2160p|1080p|720p|480p|4K)\b/i) || [])[1] || null;
  // title has many lines like "👤 42 💾 2.3 GB ⚙️ YTS"
  const seeders = Number((title.match(/👤\s*(\d+)/) || [])[1]) || null;
  const sizeMatch = title.match(/💾\s*([\d.]+)\s*(GB|MB|GiB|MiB)/i);
  let sizeBytes = null;
  if (sizeMatch) {
    const n = Number(sizeMatch[1]);
    const unit = sizeMatch[2].toLowerCase();
    sizeBytes = Math.round(n * (unit.startsWith('g') ? 1_073_741_824 : 1_048_576));
  }
  const provider = (title.match(/⚙️\s*([^\n]+)/) || [])[1]?.trim() || null;
  const language = (title.match(/🌐\s*([^\n]+)/) || [])[1]?.trim() || null;
  // infoHash + trackers from the url. torrentio returns a magnet in `infoHash` and `sources`.
  const infoHash = stream.infoHash || '';
  const trackers = (stream.sources || []).filter((s) => /^tracker:/i.test(s)).map((s) => s.slice(8));
  const magnet = infoHash
    ? `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title.split('\n')[0] || 'moviebox')}${trackers.map((t) => '&tr=' + encodeURIComponent(t)).join('')}`
    : null;
  return {
    backend: 'torrentio',
    title: title.split('\n')[0] || name,
    magnet,
    quality,
    sizeBytes,
    seeders,
    language,
    provider: provider || 'DHT',
  };
}

/** Fetch magnets for a TMDB movie or episode. */
export async function search({ tmdbId, kind, season, episode }) {
  if (!tmdbId || !kind) return [];
  const imdb = await tmdbToImdb(tmdbId, kind);
  if (!imdb) return [];
  const base = config.torrentioBase || 'https://torrentio.strem.fun';
  const path = kind === 'movie'
    ? `/stream/movie/${imdb}.json`
    : `/stream/series/${imdb}:${season || 1}:${episode || 1}.json`;
  let resp;
  try { resp = await fetch(base + path); }
  catch (err) { throw new Error(`TorrentIO unreachable: ${err.message}`); }
  if (!resp.ok) throw new Error(`TorrentIO HTTP ${resp.status}`);
  const data = await resp.json();
  const streams = Array.isArray(data?.streams) ? data.streams : [];
  // keep only entries that resolved to a magnet; sort by seeders desc
  return streams
    .map(parseStream)
    .filter((s) => s.magnet)
    .sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
}

/** The torrentio backend doesn't own URLs; it only populates the discovery list. */
export function matches() { return false; }
