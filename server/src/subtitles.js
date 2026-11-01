// Automatic subtitle downloader using opensubtitles.com's REST API.
// Fetches .srt sidecars next to the video file for the configured languages
// (default: de, en). Everything optional - without OPEN_SUBTITLES_API_KEY the
// module reports "disabled" and the metadata worker skips it.
//
// A fresh download token is cached in-process for 24h; opensubtitles.com rate
// limits unauthenticated API-key use quite hard, so we honour the Retry-After
// response and back off on 429.

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const USER_AGENT = 'MovieBox v0.5';
const DEFAULT_LANGS = ['de', 'en'];

let _token = null;
let _tokenExpiresAt = 0;
let _backoffUntil = 0;

export function isConfigured() { return Boolean(config.openSubtitlesApiKey); }

function headers(extra = {}) {
  return {
    'Api-Key': config.openSubtitlesApiKey,
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
    ...extra,
    ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
  };
}

async function login() {
  if (!config.openSubtitlesUsername || !config.openSubtitlesPassword) return null;
  if (_token && Date.now() < _tokenExpiresAt) return _token;
  const resp = await fetch(`${config.openSubtitlesApi}/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ username: config.openSubtitlesUsername, password: config.openSubtitlesPassword }),
  });
  if (!resp.ok) {
    console.warn(`[subtitles] login HTTP ${resp.status}`);
    return null;
  }
  const data = await resp.json();
  _token = data.token;
  _tokenExpiresAt = Date.now() + 23 * 3_600_000;
  return _token;
}

/**
 * Search for subtitles for a given TMDB id. Returns an array of candidates per language,
 * each with the opensubtitles file_id we need to download.
 */
export async function search({ tmdbId, imdbId, kind = 'movie', season, episode, languages = DEFAULT_LANGS }) {
  if (!isConfigured()) return [];
  if (Date.now() < _backoffUntil) return [];
  await login();

  const params = new URLSearchParams();
  params.set('languages', languages.join(','));
  params.set('type', kind === 'episode' ? 'episode' : 'movie');
  if (tmdbId) params.set('tmdb_id', String(tmdbId));
  if (imdbId) params.set('imdb_id', String(imdbId).replace(/^tt/, ''));
  if (kind === 'episode') {
    if (season) params.set('season_number', String(season));
    if (episode) params.set('episode_number', String(episode));
  }

  const resp = await fetch(`${config.openSubtitlesApi}/subtitles?${params.toString()}`, { headers: headers() });
  if (resp.status === 429) {
    const retry = Number(resp.headers.get('retry-after') || '600');
    _backoffUntil = Date.now() + retry * 1000;
    console.warn(`[subtitles] rate limited, backing off ${retry}s`);
    return [];
  }
  if (!resp.ok) throw new Error(`opensubtitles search HTTP ${resp.status}`);
  const data = await resp.json();
  return (data?.data || []).map((row) => {
    const file = row.attributes?.files?.[0];
    return {
      fileId: file?.file_id,
      language: row.attributes?.language,
      release: row.attributes?.release || '',
      downloadCount: row.attributes?.download_count || 0,
    };
  }).filter((s) => s.fileId);
}

/**
 * Download one candidate's actual .srt text. opensubtitles returns a temporary signed URL
 * that we then fetch. Needs a bearer token - without login the daily limit is low (~10/day).
 */
export async function downloadOne(fileId) {
  if (!isConfigured()) return null;
  await login();
  const resp = await fetch(`${config.openSubtitlesApi}/download`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!resp.ok) throw new Error(`opensubtitles download HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data?.link) throw new Error('opensubtitles: kein Download-Link');
  const srt = await fetch(data.link);
  if (!srt.ok) throw new Error(`srt download HTTP ${srt.status}`);
  return srt.text();
}

/**
 * Fetch + save best-rated subtitles for every language not already present as a sidecar.
 * The sidecar naming scheme is <stem>.<lang>.srt which the scanner already picks up.
 * Returns a list of {language, file} that got written.
 */
export async function ensureSidecars({ videoAbsolute, tmdbId, imdbId, kind, season, episode, existingLanguages = [] }) {
  if (!isConfigured()) return [];
  const wanted = DEFAULT_LANGS.filter((l) => !existingLanguages.includes(l));
  if (!wanted.length) return [];

  const results = [];
  const hits = await search({ tmdbId, imdbId, kind, season, episode, languages: wanted });
  // group by language, keep the single most-downloaded one each
  const byLang = {};
  for (const hit of hits) {
    const current = byLang[hit.language];
    if (!current || hit.downloadCount > current.downloadCount) byLang[hit.language] = hit;
  }

  const stem = videoAbsolute.replace(/\.[^.]+$/, '');
  for (const lang of wanted) {
    const pick = byLang[lang];
    if (!pick) continue;
    try {
      const text = await downloadOne(pick.fileId);
      if (!text) continue;
      const file = `${stem}.${lang}.srt`;
      await fs.writeFile(file, text, 'utf8');
      results.push({ language: lang, file });
    } catch (err) {
      console.warn(`[subtitles] ${lang} ${pick.fileId}: ${err.message}`);
    }
  }
  return results;
}
