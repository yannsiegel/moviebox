// yt-dlp wrapper. yt-dlp is the swiss-army knife for pulling video from the web -
// youtube, vimeo, archive.org, soundcloud, bandcamp, dailymotion, twitch VODs,
// bbc, arte, zdf, ard, etc. Supported sites list:
// https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md
//
// Two entry points:
//   probe(url)        - no download, just metadata (title, duration, formats)
//   download(url, …)  - fetch the best mp4/mkv up to the configured height

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

/** Run yt-dlp with a short-lived process, capture stdout+stderr. */
function run(args, { timeoutMs = 15 * 60_000, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ytdlpPath, [...config.ytdlpExtraArgs, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('yt-dlp timeout')); }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (onLine) {
        const lines = chunk.toString().split('\n');
        for (const line of lines) if (line.trim()) onLine(line);
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else {
        // the last useful line is usually the error summary
        const message = (stderr.trim().split('\n').pop() || `yt-dlp exited with ${code}`);
        reject(new Error(message));
      }
    });
  });
}

/** URL info without downloading. Returns null for a dead link. */
export async function probe(url) {
  try {
    const out = await run(['--dump-json', '--no-playlist', '--no-warnings', '--skip-download', url], { timeoutMs: 60_000 });
    // --dump-json emits one JSON object per entry; take the first line
    const line = out.split('\n').find((l) => l.trim().startsWith('{'));
    if (!line) return null;
    const info = JSON.parse(line);
    return {
      kind: info.playlist ? 'playlist' : 'video',
      title: info.title || info.id || '',
      uploader: info.uploader || info.channel || '',
      durationSec: Number(info.duration) || null,
      sourceUrl: info.webpage_url || url,
      extractor: info.extractor_key || info.extractor || '',
      thumbnail: info.thumbnail || null,
      year: info.release_year || (info.upload_date ? Number(info.upload_date.slice(0, 4)) : null),
    };
  } catch (err) {
    throw new Error(`yt-dlp probe failed: ${err.message}`);
  }
}

/**
 * Download the URL to targetDir. The output filename comes from the title (sanitised).
 * onProgress({ pct, speed, eta }) is called while yt-dlp runs.
 * Returns the final absolute path.
 *
 * The format string prefers an all-in-one mp4 up to the configured height; falls back to
 * best-video + best-audio with ffmpeg merging (yt-dlp does the merge itself).
 */
export async function download(url, targetDir, { onProgress, maxHeight = config.maxTranscodeHeight } = {}) {
  await fs.mkdir(targetDir, { recursive: true });

  // yt-dlp prints progress lines when stdout is a pipe only if we ask with --newline;
  // we also parse them into pct/speed/eta for the UI.
  const outTemplate = path.join(targetDir, '%(title)s.%(ext)s');
  const format = `bestvideo[height<=${maxHeight}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${maxHeight}][ext=mp4]/best[height<=${maxHeight}]/best`;

  let finalFile = null;
  const onLine = (line) => {
    // Destination lines tell us the actual filename yt-dlp picked
    const dest = line.match(/^\[download\]\s+Destination:\s+(.+)$/);
    if (dest) { finalFile = dest[1].trim(); return; }
    const merged = line.match(/^\[Merger\]\s+Merging formats into\s+"(.+)"$/);
    if (merged) { finalFile = merged[1].trim(); return; }
    // "[download]  12.3% of ~ 450.00MiB at 2.00MiB/s ETA 03:12"
    const prog = line.match(/\[download\]\s+(\d+(?:\.\d+)?)% of\s+~?\s*(\S+)(?:\s+at\s+(\S+))?(?:\s+ETA\s+(\S+))?/);
    if (prog && onProgress) {
      onProgress({ pct: Number(prog[1]), size: prog[2], speed: prog[3] || null, eta: prog[4] || null });
    }
  };

  await run(['--no-playlist', '--no-warnings', '--newline', '--restrict-filenames', '-f', format, '--merge-output-format', 'mkv', '-o', outTemplate, url], { onLine });

  if (!finalFile) {
    // fall back: pick the newest file in targetDir written in the last minute
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const recent = await Promise.all(entries.filter((e) => e.isFile()).map(async (e) => {
      const p = path.join(targetDir, e.name);
      const st = await fs.stat(p);
      return { p, mtime: st.mtimeMs };
    }));
    recent.sort((a, b) => b.mtime - a.mtime);
    finalFile = recent[0]?.p || null;
  }
  if (!finalFile) throw new Error('yt-dlp lief, aber keine Datei gefunden');
  return { path: finalFile };
}

/** Does this URL look like something yt-dlp handles? Permissive: any http(s) that isn't a plain file. */
export function matches(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  // let direct.js handle plain .mkv/.mp4 URLs; yt-dlp also could, but direct is cheaper
  if (/\.(mkv|mp4|m4v|webm|avi|mov)(\?|$)/i.test(url)) return false;
  return true;
}
