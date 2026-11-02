// Torrent / magnet downloader via aria2c as a child process.
//
// We previously used the `webtorrent` npm package in-process. On node 26
// webtorrent 2.5.1 crashes synchronously inside its own internals every time
// a magnet arrives (ERR_INVALID_ARG_TYPE in uint8-util), which no amount of
// defensive wrapping around our call site can fix.
//
// aria2 is the robust alternative: a mature stand-alone torrent client that
// speaks magnets, HTTP, HTTPS and metalinks, is in every Debian / Ubuntu
// repo, and runs as a child process so a crash can never kill our node
// server. install.sh pulls it in as a package.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIDEO_EXTENSIONS } from '../parse-filename.js';
import { config } from '../config.js';

const PUBLIC_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://opentracker.i2p.rocks:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'https://tracker.gbitt.info/announce',
  'http://tracker.openbittorrent.com:80/announce',
].join(',');

/** True if aria2c is on PATH. */
export async function available() {
  return new Promise((resolve) => {
    const child = spawn(config.aria2Path || 'aria2c', ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

function listVideoFiles(dir) {
  // walk one level deep (aria2 writes "<targetDir>/<torrent name>/<file>")
  return (async () => {
    const out = [];
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const inner = await fs.readdir(full, { withFileTypes: true }).catch(() => []);
        for (const sub of inner) {
          if (sub.isFile() && VIDEO_EXTENSIONS.has(path.extname(sub.name).toLowerCase())) {
            const st = await fs.stat(path.join(full, sub.name)).catch(() => null);
            if (st) out.push({ path: path.join(full, sub.name), size: st.size });
          }
        }
      } else if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const st = await fs.stat(full).catch(() => null);
        if (st) out.push({ path: full, size: st.size });
      }
    }
    return out;
  })();
}

/**
 * Download a magnet into targetDir. Returns {path} of the largest video file produced.
 * onProgress({pct, speed, eta, peers, seeders, size}) is called while aria2 runs.
 */
export async function download(magnetOrUrl, targetDir, { onProgress } = {}) {
  if (!(await available())) {
    throw new Error('aria2c nicht installiert – auf dem server "sudo apt install aria2" nachziehen');
  }
  if (typeof magnetOrUrl !== 'string' || !magnetOrUrl.startsWith('magnet:')) {
    throw new Error('Kein magnet-link');
  }
  await fs.mkdir(targetDir, { recursive: true });

  const beforeFiles = new Set((await listVideoFiles(targetDir)).map((f) => f.path));

  return new Promise((resolve, reject) => {
    const args = [
      '--dir=' + targetDir,
      '--seed-time=0',                                       // stop seeding once done
      '--bt-stop-timeout=600',                               // give up after 10 min with no progress
      '--summary-interval=5',                                // print progress every 5s
      '--console-log-level=warn',
      '--bt-tracker=' + PUBLIC_TRACKERS,
      '--enable-dht=true',
      '--bt-enable-lpd=true',
      '--follow-torrent=mem',
      '--max-connection-per-server=16',
      '--split=16',
      magnetOrUrl,
    ];
    const child = spawn(config.aria2Path || 'aria2c', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    const buffer = { out: '' };
    child.stdout.on('data', (chunk) => {
      buffer.out += chunk;
      const lines = buffer.out.split('\n');
      buffer.out = lines.pop() || '';
      for (const line of lines) parseProgress(line);
    });
    child.stderr.on('data', (c) => { stderr += c; });

    // [#abcdef  12MiB/450MiB(2%) CN:12 SD:5 DL:1.2MiB ETA:5m30s]
    const progressRe = /\[#\S+\s+(\S+)\/(\S+)\((\d+)%\)\s+CN:(\d+)\s+SD:(\d+)\s+DL:(\S+?)(?:\s+UL:\S+)?(?:\s+ETA:(\S+))?\]/;
    function parseProgress(line) {
      const m = line.match(progressRe);
      if (!m || !onProgress) return;
      onProgress({
        pct: Number(m[3]),
        size: m[2],
        peers: Number(m[4]),
        seeders: Number(m[5]),
        speed: m[6] + '/s',
        eta: m[7] || null,
      });
    }

    child.on('error', (err) => reject(new Error(`aria2 konnte nicht starten: ${err.message}`)));

    child.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error(`aria2 beendete mit code ${code}: ${(stderr.trim().split('\n').pop() || 'unbekannter Fehler')}`));
      }
      // find video files aria2 produced that weren't there before
      const after = await listVideoFiles(targetDir);
      const fresh = after.filter((f) => !beforeFiles.has(f.path)).sort((a, b) => b.size - a.size);
      const picked = fresh[0] || after.sort((a, b) => b.size - a.size)[0];
      if (!picked) return reject(new Error('aria2 fertig, aber keine video-datei gefunden'));
      resolve({ path: picked.path });
    });
  });
}

/** This backend owns magnet links. */
export function matches(url) {
  return /^magnet:/i.test(url);
}
