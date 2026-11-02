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

/** Public BitTorrent trackers to add to every magnet - several of the magnets we get
 *  from TorrentIO only carry a few trackers, which is often the reason webtorrent sits
 *  at 0% forever. These are the long-running public ones used by every mainstream client. */
const PUBLIC_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://opentracker.i2p.rocks:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
];

const STALL_TIMEOUT_MS = 5 * 60_000;   // 5 min at 0 % and no peers -> give up on this magnet

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
      // Add all public trackers in parallel so peer discovery doesn't rely on
      // whatever handful of trackers the magnet shipped with.
      torrent = c.add(magnetOrUrl, {
        path: targetDir,
        destroyStoreOnDestroy: false,
        announce: PUBLIC_TRACKERS,
      });
    } catch (err) {
      return reject(new Error(`webtorrent.add warf: ${err.message}`));
    }
    if (!torrent) return reject(new Error('webtorrent.add gab kein torrent zurück'));

    const started = Date.now();
    let settled = false;
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      clearInterval(progressTimer);
      try { torrent.destroy({ destroyStore: true }, () => {}); } catch {}
      reject(new Error(msg));
    };
    const succeed = (val) => {
      if (settled) return;
      settled = true;
      clearInterval(progressTimer);
      resolve(val);
    };

    const progressTimer = setInterval(() => {
      // stall guard: no bytes received after STALL_TIMEOUT_MS -> no peers, give up
      if (torrent.progress === 0 && torrent.numPeers === 0 && Date.now() - started > STALL_TIMEOUT_MS) {
        return fail('Keine peers nach 5 min – torrent tot?');
      }
      if (!onProgress) return;
      onProgress({
        pct: Math.round(torrent.progress * 10000) / 100,
        speed: `${(torrent.downloadSpeed / 1_048_576).toFixed(2)} MB/s`,
        eta: isFinite(torrent.timeRemaining) && torrent.timeRemaining > 0 ? `${Math.round(torrent.timeRemaining / 1000)}s` : null,
        size: torrent.length ? `${(torrent.length / 1_073_741_824).toFixed(2)} GB` : null,
        peers: torrent.numPeers,
      });
    }, 1500);

    torrent.on('error', (err) => fail(`Torrent-Fehler: ${err.message || err}`));
    torrent.on('warning', (err) => console.warn(`[torrent] warning: ${err?.message || err}`));

    torrent.on('done', async () => {
      // pick the largest video file from the torrent
      const videoFiles = torrent.files
        .filter((f) => VIDEO_EXTENSIONS.has(path.extname(f.name).toLowerCase()))
        .sort((a, b) => b.length - a.length);
      const picked = videoFiles[0] || torrent.files.sort((a, b) => b.length - a.length)[0];
      if (!picked) return fail('Torrent fertig, aber keine video-datei drin');
      const resultPath = path.join(targetDir, picked.path);
      // keep seeding briefly to be nice; then detach (files stay)
      setTimeout(() => torrent.destroy({ destroyStore: false }, () => {}), 30_000);
      succeed({ path: resultPath });
    });
  });
}

/** This backend handles magnet links. */
export function matches(url) {
  return /^magnet:/i.test(url);
}
