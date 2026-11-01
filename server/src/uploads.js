// Streams an uploaded video file straight into the tenant's videoDir, then kicks the scanner
// so the file shows up in the library within seconds. The upload is the raw request body
// (no multipart) with the filename in the X-Filename header - simpler than busboy/multer,
// no extra dependency.

import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';
import { VIDEO_EXTENSIONS } from './parse-filename.js';

const MAX_BYTES = 50 * 1024 * 1024 * 1024;      // 50 GB per file; raise for 4K remuxes if needed

/** Pulls a safe filename from the header; falls back to a timestamp-based name. */
function safeName(raw) {
  const base = (raw || '').split(/[\\/]/).pop() || '';
  const cleaned = base.replace(/[^A-Za-z0-9._()\[\] -]/g, '').slice(0, 200);
  if (!cleaned) return `upload-${Date.now()}.mkv`;
  const ext = path.extname(cleaned).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) {
    throw Object.assign(new Error(`Nicht unterstützte Datei (erlaubt: ${[...VIDEO_EXTENSIONS].join(', ')})`), { status: 400 });
  }
  return cleaned;
}

/**
 * Receives the request body and writes it into videoDir. If a file with the same name already
 * exists, a short random suffix keeps both. Returns the relative path and byte count.
 */
export async function receiveUpload(req, rawName, { subfolder = '' } = {}) {
  const name = safeName(rawName);
  await fs.mkdir(req.tenant.videoDir, { recursive: true });
  const targetDir = subfolder
    ? path.join(req.tenant.videoDir, subfolder.replace(/[^A-Za-z0-9._()\[\] /-]/g, '').replace(/\.\.+/g, ''))
    : req.tenant.videoDir;
  await fs.mkdir(targetDir, { recursive: true });

  let finalName = name;
  let finalPath = path.join(targetDir, finalName);
  try {
    await fs.access(finalPath);
    const ext = path.extname(name);
    const stem = path.basename(name, ext);
    finalName = `${stem}-${crypto.randomBytes(3).toString('hex')}${ext}`;
    finalPath = path.join(targetDir, finalName);
  } catch { /* ok, name is free */ }

  const tmpPath = `${finalPath}.part`;
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BYTES) req.destroy(new Error('Datei zu groß'));
  });

  try {
    await pipeline(req, createWriteStream(tmpPath));
    if (size === 0) {
      await fs.rm(tmpPath, { force: true });
      throw Object.assign(new Error('Leerer Upload'), { status: 400 });
    }
    await fs.rename(tmpPath, finalPath);
    return { relative: path.relative(req.tenant.videoDir, finalPath), sizeBytes: size, name: finalName };
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}
