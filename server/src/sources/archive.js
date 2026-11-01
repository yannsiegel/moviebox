// archive.org as a source backend.
// archive.org hosts a huge library of public-domain films, documentaries, concerts,
// educational content, and (often legally) early-cinema and golden-age Hollywood.
// Everything here is free to download without any auth. yt-dlp handles archive.org
// natively, so the "download" method just hands the URL to the existing yt-dlp wrapper.
//
// Search uses archive.org's advanced search endpoint (no auth, generous rate limit).

import { config } from '../config.js';
import * as ytdlp from './ytdlp.js';

const ADVANCED_SEARCH = 'https://archive.org/advancedsearch.php';
const DETAILS_BASE = 'https://archive.org/details/';

/** Searches movie-like items. The "mediatype:movies" clause excludes audio and texts. */
export async function search(query, { limit = 25 } = {}) {
  if (!query) return [];
  const url = new URL(ADVANCED_SEARCH);
  url.searchParams.set('q', `(${query}) AND mediatype:(movies)`);
  url.searchParams.set('fl[]', 'identifier,title,description,year,creator,downloads,subject');
  url.searchParams.set('sort[]', 'downloads desc');
  url.searchParams.set('rows', String(limit));
  url.searchParams.set('page', '1');
  url.searchParams.set('output', 'json');

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`archive.org HTTP ${resp.status}`);
  const data = await resp.json();
  const docs = data?.response?.docs || [];
  return docs.map((d) => ({
    backend: 'archive',
    title: d.title || d.identifier,
    url: DETAILS_BASE + d.identifier,
    year: d.year || null,
    creator: Array.isArray(d.creator) ? d.creator.join(', ') : (d.creator || ''),
    description: d.description || '',
    downloads: d.downloads || 0,
    provider: 'archive.org',
    language: null,
  }));
}

/** Downloads an archive.org item via yt-dlp. The archive.org extractor is already built in. */
export async function download(url, targetDir, opts) {
  return ytdlp.download(url, targetDir, opts);
}

/** URL that archive.js owns. */
export function matches(url) {
  return /^https?:\/\/(?:archive\.org|www\.archive\.org)\//i.test(url);
}
