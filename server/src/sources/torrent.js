// Torrent / magnet downloader. Uses the `webtorrent` npm package as an in-process
// torrent client - no external qbittorrent or transmission needed. The package is
// an *optional* dependency: if it isn't installed, this backend reports "unavailable"
// and the install.sh prints how to add it.
//
// A single global client runs for the server's lifetime. Each `download(magnet, …)`
// adds the torrent, waits for the "done" event, then destroys the handle (keeping
// the files). Progress is reported via onProgress({ pct, speed, eta }).

import path from 'node:path';
import fs from 'node:fs/promises';
import { VIDEO_EXTENSIONS } from '../parse-filename.js';

let _client = null;
let _loadError = null;
let _globalGuardInstalled = false;

/** webtorrent sometimes throws TypeErrors from inside its own internals when it
 *  dislikes a magnet string. That bypasses the torrent.on('error') listener and
 *  kills the whole node process. A top-level guard keeps moviebox alive. */
function installGlobalGuard() {
  if (_globalGuardInstalled) return;
  _globalGuardInstalled = true;
  process.on('uncaughtException', (err) => {
    const stack = err?.stack || '';
    if (stack.includes('webtorrent') || stack.includes('uint8-util')) {
      console.error(`[torrent] swallowed uncaughtException: ${err.message}`);
      return;
    }
    // not our fault — crash the way the process would normally
    console.error('uncaughtException', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
    const stack = err?.stack || '';
    if (stack.includes('webtorrent') || stack.includes('uint8-util')) {
      console.error(`[torrent] swallowed unhandledRejection: ${err.message}`);
      return;
    }
    throw err;
  });
}

async function client() {
  if (_client) return _client;
  if (_loadError) throw _loadError;
  try {
    const mod = await import('webtorrent');
    const WebTorrent = mod.default || mod.WebTorrent || mod;
    installGlobalGuard();
    _client = new WebTorrent();
    _client.on('error', (err) => console.warn(`[torrent] client: ${err.message || err}`));
    return _client;
  } catch (err) {
    _loadError = new Error(`webtorrent nicht installiert: ${err.message}. Installiere mit "npm install webtorrent" im server/-Ordner.`);
    throw _loadError;
  }
}

/** Minimum shape of a magnet URI we're willing to hand to webtorrent. */
function validateMagnet(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('magnet:')) {
    throw new Error('Kein magnet-link');
  }
  const m = uri.match(/urn:btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/);
  if (!m) throw new Error('magnet-link ohne gültigen info-hash');
}

/** True if webtorrent could be loaded. The server advertises this to the UI. */
export async function available() {
  try { await client(); return true; } catch { return false; }
}

/** Add a magnet, wait for completion, return the path of the largest video file. */
export async function download(magnetOrUrl, targetDir, { onProgress } = {}) {
  validateMagnet(magnetOrUrl);
  const c = await client();
  await fs.mkdir(targetDir, { recursive: true });

  return new Promise((resolve, reject) => {
    let torrent;
    try {
      torrent = c.add(magnetOrUrl, { path: targetDir, destroyStoreOnDestroy: false });
    } catch (err) {
      return reject(new Error(`webtorrent.add warf: ${err.message}`));
    }
    if (!torrent) return reject(new Error('webtorrent.add gab kein torrent zurück'));

    const progressTimer = setInterval(() => {
      if (!onProgress) return;
      onProgress({
        pct: Math.round(torrent.progress * 10000) / 100,
        speed: `${(torrent.downloadSpeed / 1_048_576).toFixed(2)} MB/s`,
        eta: isFinite(torrent.timeRemaining) ? `${Math.round(torrent.timeRemaining / 1000)}s` : null,
        size: `${(torrent.length / 1_073_741_824).toFixed(2)} GB`,
      });
    }, 1000);

    torrent.on('error', (err) => {
      clearInterval(progressTimer);
      reject(new Error(`Torrent-Fehler: ${err.message || err}`));
    });

    torrent.on('done', async () => {
      clearInterval(progressTimer);
      // pick the largest video file from the torrent
      const videoFiles = torrent.files
        .filter((f) => VIDEO_EXTENSIONS.has(path.extname(f.name).toLowerCase()))
        .sort((a, b) => b.length - a.length);
      const picked = videoFiles[0] || torrent.files.sort((a, b) => b.length - a.length)[0];
      const resultPath = path.join(targetDir, picked.path);
      // keep seeding briefly to be nice; then detach (files stay)
      setTimeout(() => torrent.destroy({ destroyStore: false }, () => {}), 30_000);
      resolve({ path: resultPath });
    });
  });
}

/** This backend handles magnet links. */
export function matches(url) {
  return /^magnet:/i.test(url);
}
