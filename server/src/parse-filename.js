// Extract title, year, season and episode from a video file's path.
// Deliberately tolerant: a wrong guess is corrected later by TMDB matching
// or by the user editing the item in the app. The goal here is to never crash
// and to recover something usable from the usual naming schemes.
//
// Movie patterns:
//   The.Matrix.1999.1080p.mkv
//   The Matrix (1999).mkv
//   The Matrix [1999] BluRay.mp4
//   Inception.mkv                               (no year — kept as plain title)
//
// Series patterns:
//   Breaking Bad - S01E02 - Cat's in the Bag.mkv
//   Breaking.Bad.S01E02.720p.mkv
//   breaking_bad_1x02.mp4
//   Breaking Bad/Season 1/02 - Cat's in the Bag.mkv  (season from parent folder)
//   The.Office.US.S03E04.mkv                    (country suffix kept as part of title)

import path from 'node:path';

/** File extensions treated as video. */
export const VIDEO_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.m4v', '.mov', '.avi', '.ts', '.m2ts', '.webm', '.wmv', '.flv', '.mpg', '.mpeg',
]);

export function isVideoFile(filePath) {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

const CLEAN_RE = /[._]+/g;
const QUALITY_RE = /\b(2160p|1080p|720p|480p|bluray|web[- ]?dl|webrip|hdrip|hdtv|x264|x265|hevc|h264|h265|aac|ac3|dts|5\.1|7\.1|atmos|repack|proper|extended|remastered|uncut|director[s']*[- ]?cut|unrated|limited)\b/gi;
const RELEASE_GROUP_RE = /-[A-Za-z0-9]{2,}$/;
const PAREN_RE = /\s*[\[({].*?[\])}]\s*/g;

function tidy(raw) {
  return raw
    .replace(CLEAN_RE, ' ')
    .replace(QUALITY_RE, ' ')
    .replace(PAREN_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pulls a four-digit year (19xx or 20xx) out of a string; returns null if none. */
function extractYear(text) {
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

const EPISODE_RES = [
  /S(\d{1,2})\s*E(\d{1,3})/i,            // S01E02, s1e2, S01 E02
  /\b(\d{1,2})x(\d{1,3})\b/i,            // 1x02, 12x104
  /Season\s*(\d{1,2}).*?Episode\s*(\d{1,3})/i,
];

/** Finds "S01E02" or "1x02" style markers; returns {season, episode} or null. */
function extractEpisode(text) {
  for (const re of EPISODE_RES) {
    const m = text.match(re);
    if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  }
  return null;
}

/** Reads a season from a parent folder like "Season 1", "Staffel 1", "S01". */
function extractSeasonFromFolder(parentName) {
  const m = parentName.match(/(?:season|staffel|s)\s*0*(\d{1,2})/i);
  return m ? Number(m[1]) : null;
}

/** Reads an episode number from "02 - title" style filenames. */
function extractEpisodeFromPrefix(stem) {
  const m = stem.trim().match(/^0*(\d{1,3})\b/);
  return m ? Number(m[1]) : null;
}

/**
 * Parse one file. Returns:
 *   { kind: 'movie', title, year | null, cleanName }
 *   { kind: 'episode', showTitle, season, episode, title (= episode title or ''), cleanName }
 *
 * cleanName is what we show to the user if TMDB has no match - a readable
 * version of the file's own name without quality tags and release groups.
 */
export function parseFilename(fullPath) {
  const ext = path.extname(fullPath);
  const stem = path.basename(fullPath, ext);
  const parentName = path.basename(path.dirname(fullPath));
  const grandparentName = path.basename(path.dirname(path.dirname(fullPath)));

  // -------- series detection
  const sxe = extractEpisode(stem) || extractEpisode(parentName);
  if (sxe) {
    // The show title usually lives in the part before S01E02, or in the grandparent folder.
    let before = stem.split(new RegExp(`(?:${EPISODE_RES.map((r) => r.source).join('|')})`, 'i'))[0] || '';
    before = tidy(before.replace(RELEASE_GROUP_RE, ''));
    const showTitle = before || tidy(grandparentName) || tidy(parentName);
    // Episode title: whatever is left after the SxxEyy marker, cleaned up.
    const after = stem.split(new RegExp(`(?:${EPISODE_RES.map((r) => r.source).join('|')})`, 'i')).slice(-1)[0] || '';
    const episodeTitle = tidy(after.replace(RELEASE_GROUP_RE, '').replace(/^[-\s]+/, ''));
    return {
      kind: 'episode',
      showTitle: showTitle.replace(/\s*-\s*$/, '').trim(),
      season: sxe.season,
      episode: sxe.episode,
      title: episodeTitle,
      cleanName: tidy(stem.replace(RELEASE_GROUP_RE, '')),
    };
  }

  // Folder-based scheme: Show/Season 1/02 - Title.mkv
  const parentSeason = extractSeasonFromFolder(parentName);
  const prefixEpisode = extractEpisodeFromPrefix(stem);
  if (parentSeason !== null && prefixEpisode !== null) {
    const showTitle = tidy(grandparentName);
    const afterNumber = stem.replace(/^0*\d{1,3}\s*[-.]*\s*/, '');
    return {
      kind: 'episode',
      showTitle: showTitle || tidy(parentName),
      season: parentSeason,
      episode: prefixEpisode,
      title: tidy(afterNumber.replace(RELEASE_GROUP_RE, '')),
      cleanName: tidy(stem.replace(RELEASE_GROUP_RE, '')),
    };
  }

  // -------- movie fallback
  const year = extractYear(stem);
  const titlePart = year
    ? stem.slice(0, stem.search(new RegExp(`\\b${year}\\b`))).replace(RELEASE_GROUP_RE, '')
    : stem.replace(RELEASE_GROUP_RE, '');
  return {
    kind: 'movie',
    title: tidy(titlePart) || tidy(stem),
    year,
    cleanName: tidy(stem.replace(RELEASE_GROUP_RE, '')),
  };
}
