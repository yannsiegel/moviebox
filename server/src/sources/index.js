// Dispatches a URL to the right source backend. Order matters:
// a plain video file URL goes to the lightweight direct downloader, everything else
// is tried with yt-dlp (which covers youtube, vimeo, archive.org, bbc, arte, zdf
// and ~1800 other sites). More backends (torrent, usenet) can plug in here later
// without touching the queue.

import * as direct from './direct.js';
import * as ytdlp from './ytdlp.js';

const BACKENDS = [direct, ytdlp];

export function pickBackend(url) {
  for (const b of BACKENDS) if (b.matches(url)) return b;
  return null;
}

/** URL info without downloading. Returns a uniform shape across backends. */
export async function probe(url) {
  const backend = pickBackend(url);
  if (!backend) throw new Error('Keine Quelle für diese URL gefunden');
  const info = await backend.probe(url);
  // normalise: both backends return different shapes
  if (backend === direct) {
    return {
      backend: 'direct',
      kind: info.kind === 'video' ? 'video' : 'unknown',
      title: info.filename.replace(/\.[^.]+$/, ''),
      durationSec: null,
      sizeBytes: info.sizeBytes,
      sourceUrl: info.finalUrl,
      filename: info.filename,
    };
  }
  return {
    backend: 'ytdlp',
    kind: info.kind,
    title: info.title,
    uploader: info.uploader,
    durationSec: info.durationSec,
    sizeBytes: null,
    sourceUrl: info.sourceUrl,
    extractor: info.extractor,
    thumbnail: info.thumbnail,
    year: info.year,
  };
}

export async function download(url, targetDir, opts) {
  const backend = pickBackend(url);
  if (!backend) throw new Error('Keine Quelle für diese URL gefunden');
  return backend.download(url, targetDir, opts);
}

export { direct, ytdlp };
