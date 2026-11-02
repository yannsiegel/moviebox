// Streaming + resume. Delivery of the actual bytes is handed off to nginx via X-Accel-Redirect
// after this server has validated the token and found the file. When ACCEL_REDIRECT_PREFIX is
// not configured (dev, no nginx), Node streams the file itself with Range support as a fallback.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { db, toObjectId } from './db.js';

const CONTENT_TYPES = {
  '.mkv': 'video/x-matroska',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.wmv': 'video/x-ms-wmv',
  '.srt': 'application/x-subrip',
  '.vtt': 'text/vtt',
  '.ass': 'text/x-ssa',
};

export function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** Look up a media item (movie or episode) by id in the current tenant. */
export async function findMedia(id) {
  const _id = toObjectId(id);
  if (!_id) return null;
  const movie = await db.movies.findOne({ _id });
  if (movie) return { ...movie, kind: 'movie' };
  const episode = await db.episodes.findOne({ _id });
  if (episode) return { ...episode, kind: 'episode' };
  return null;
}

/**
 * Stream a media file to the client. When nginx is in front and ACCEL_REDIRECT_PREFIX is set, this
 * returns an X-Accel-Redirect header - nginx then does the Range handling and byte pushing itself,
 * which is dramatically more efficient than Node for multi-GB files. Otherwise it falls back to a
 * manual Range-aware fs stream.
 */
export async function serveMedia(req, res, item) {
  const absolute = path.join(req.tenant.videoDir, item.path);
  const type = contentTypeFor(absolute);

  if (config.accelRedirectPrefix) {
    // X-Accel-Redirect expects a URL-path, so each path segment must be URI-encoded
    // (spaces, parens, brackets - all common in torrent folder names). Slashes stay.
    const encodedPath = item.path.split('/').map(encodeURIComponent).join('/');
    // nginx `alias` points at mediaDir (/srv/moviebox/media/), but item.path is relative
    // to videoDir (which is mediaDir/video/). Compute the subdir and prepend it so the
    // final URL maps to the real file on disk.
    const videoSubdir = path.posix.relative(req.tenant.mediaDir, req.tenant.videoDir);
    res.set('Content-Type', type);
    res.set('X-Accel-Redirect', path.posix.join(config.accelRedirectPrefix, videoSubdir, encodedPath));
    res.set('Accept-Ranges', 'bytes');
    res.end();
    return;
  }

  // ---- Node fallback: handle Range manually
  let stat;
  try { stat = await fsp.stat(absolute); } catch { return res.status(404).json({ error: 'Datei nicht gefunden' }); }
  const total = stat.size;
  const range = req.headers.range;

  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) return res.status(416).set('Content-Range', `bytes */${total}`).end();
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : total - 1;
    if (start >= total || end >= total || start > end) {
      return res.status(416).set('Content-Range', `bytes */${total}`).end();
    }
    res.status(206).set({
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(absolute, { start, end }).pipe(res);
  } else {
    res.set({ 'Content-Type': type, 'Content-Length': total, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(absolute).pipe(res);
  }
}
