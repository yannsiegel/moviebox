// Direct HTTP(S) URL download. The lightest-weight source: just stream the response body
// into a file. We check the size up front so a wrong URL doesn't eat the whole disk.

import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { VIDEO_EXTENSIONS } from '../parse-filename.js';

const MAX_BYTES = 50 * 1024 * 1024 * 1024;      // 50 GB default; raise in config if ever needed

/** Pull a filename out of Content-Disposition or the URL's last path segment. */
function filenameFrom(resp, url) {
  const cd = resp.headers.get('content-disposition') || '';
  const match = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i);
  if (match) return decodeURIComponent(match[1]).split(/[\\/]/).pop();
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    if (last) return decodeURIComponent(last);
  } catch { /* ignore */ }
  return `download-${Date.now()}.mkv`;
}

function sanitize(name) {
  const cleaned = name.replace(/[^A-Za-z0-9._()\[\] -]/g, '').slice(0, 200);
  return cleaned || `download-${Date.now()}.mkv`;
}

/** HEAD the URL and report back whether it looks like something we'd download. */
export async function probe(url) {
  const resp = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  if (!resp.ok) throw new Error(`HEAD ${resp.status}`);
  const type = resp.headers.get('content-type') || '';
  const length = Number(resp.headers.get('content-length') || 0);
  const name = filenameFrom(resp, resp.url || url);
  const ext = path.extname(name).toLowerCase();
  const looksVideo = type.startsWith('video/') || VIDEO_EXTENSIONS.has(ext);
  return {
    kind: looksVideo ? 'video' : 'unknown',
    contentType: type,
    sizeBytes: length || null,
    filename: name,
    finalUrl: resp.url || url,
  };
}

/**
 * Downloads the URL to targetDir. `onProgress` is called with (loaded, total|null) if given.
 * Returns the final absolute path and byte count.
 */
export async function download(url, targetDir, { onProgress } = {}) {
  const head = await probe(url);
  if (head.sizeBytes && head.sizeBytes > MAX_BYTES) {
    throw new Error(`Datei zu groß: ${(head.sizeBytes / 1_073_741_824).toFixed(1)} GB`);
  }
  const resp = await fetch(head.finalUrl, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`GET ${resp.status}`);
  if (!resp.body) throw new Error('Kein Body');

  await fs.mkdir(targetDir, { recursive: true });
  const name = sanitize(head.filename);
  const finalPath = path.join(targetDir, name);
  const tmpPath = `${finalPath}.part`;

  const total = Number(resp.headers.get('content-length')) || null;
  let loaded = 0;
  const stream = Readable.fromWeb(resp.body);
  stream.on('data', (chunk) => {
    loaded += chunk.length;
    if (loaded > MAX_BYTES) stream.destroy(new Error('Datei zu groß'));
    if (onProgress) onProgress(loaded, total);
  });

  try {
    await pipeline(stream, createWriteStream(tmpPath));
    await fs.rename(tmpPath, finalPath);
    return { path: finalPath, name, sizeBytes: loaded };
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

/** Does this URL look like something `direct` can handle? Rough: must be http(s) and a direct file. */
export function matches(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).toLowerCase();
    return VIDEO_EXTENSIONS.has(ext);
  } catch { return false; }
}
