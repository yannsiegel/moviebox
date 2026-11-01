// TMDB client. Everything optional: no API key -> this module reports "disabled" and the metadata
// worker falls back to filename-only data. One tiny in-process cache (positive + negative) keeps
// repeat lookups cheap and the TMDB bill at zero.
//
// Only the handful of endpoints we actually need are wrapped: search, details, images, episodes.
// If TMDB changes a field name, the extraction in metadata.js is the only place that cares.

import { config } from './config.js';

const cache = new Map(); // key -> { data, until }
const CACHE_TTL_MS = 24 * 3_600_000;
const NEGATIVE_TTL_MS = 6 * 3_600_000;

export function isConfigured() {
  return Boolean(config.tmdbApiKey);
}

async function get(pathAndQuery) {
  if (!isConfigured()) return null;
  const cached = cache.get(pathAndQuery);
  if (cached && cached.until > Date.now()) return cached.data;

  const url = `${config.tmdbApi}${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(config.tmdbApiKey)}&language=${encodeURIComponent(config.tmdbLanguage)}`;
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`TMDB unreachable: ${err.message}`);
  }

  if (response.status === 404) {
    cache.set(pathAndQuery, { data: null, until: Date.now() + NEGATIVE_TTL_MS });
    return null;
  }
  if (response.status === 429) throw new Error('TMDB rate limited (HTTP 429)');
  if (!response.ok) throw new Error(`TMDB ${response.status} on ${pathAndQuery}`);

  const data = await response.json();
  cache.set(pathAndQuery, { data, until: Date.now() + CACHE_TTL_MS });
  return data;
}

export function posterUrl(path, size = 'w500') {
  if (!path) return null;
  return `${config.tmdbImageBase}/${size}${path}`;
}

export function backdropUrl(path, size = 'w1280') {
  if (!path) return null;
  return `${config.tmdbImageBase}/${size}${path}`;
}

// -------- movies

export async function searchMovie(title, year) {
  const query = `/search/movie?query=${encodeURIComponent(title)}${year ? `&year=${year}` : ''}&include_adult=false`;
  const data = await get(query);
  return data?.results?.[0] || null;
}

export async function movieDetails(tmdbId) {
  return get(`/movie/${tmdbId}?append_to_response=credits`);
}

// -------- series

export async function searchShow(title, year) {
  const query = `/search/tv?query=${encodeURIComponent(title)}${year ? `&first_air_date_year=${year}` : ''}&include_adult=false`;
  const data = await get(query);
  return data?.results?.[0] || null;
}

export async function showDetails(tmdbId) {
  return get(`/tv/${tmdbId}?append_to_response=credits`);
}

export async function seasonDetails(tmdbId, seasonNumber) {
  return get(`/tv/${tmdbId}/season/${seasonNumber}`);
}

export async function episodeDetails(tmdbId, seasonNumber, episodeNumber) {
  return get(`/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`);
}
