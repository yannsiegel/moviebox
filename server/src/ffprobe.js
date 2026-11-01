// Thin wrapper around ffprobe. Returns a stripped-down JSON for one file:
//
//   {
//     durationSec: 5400.21,
//     container: 'matroska,webm',
//     video: { codec: 'h264', width: 1920, height: 1080, fps: 23.976, bitrate: 8_500_000 },
//     audio: [ { codec: 'aac', channels: 2, language: 'ger', title: '' }, ... ],
//     subtitles: [ { codec: 'subrip', language: 'eng', title: '', forced: false, default: false }, ... ],
//     sizeBytes: 2_123_456_789,
//   }
//
// A probe can take a moment on a slow disk (ffprobe reads the moov atom); the caller is expected to
// run many of these from the metadata worker's job queue, not inside a request handler.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { config } from './config.js';

/** Spawn a short-lived process, return stdout. Throws with stderr on failure. */
function run(cmd, args, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('ffprobe timeout')); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `ffprobe exited with ${code}`));
    });
  });
}

function parseFps(frameRate) {
  if (!frameRate || frameRate === '0/0') return null;
  const [num, den] = frameRate.split('/').map(Number);
  if (!den) return null;
  return Math.round((num / den) * 1000) / 1000;
}

export async function probe(filePath) {
  const { size } = await fs.stat(filePath);
  const raw = await run(config.ffprobePath, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  const data = JSON.parse(raw);

  const video = (data.streams || []).find((s) => s.codec_type === 'video');
  const audioStreams = (data.streams || []).filter((s) => s.codec_type === 'audio');
  const subStreams = (data.streams || []).filter((s) => s.codec_type === 'subtitle');

  return {
    durationSec: Number(data.format?.duration ?? video?.duration ?? 0) || 0,
    container: data.format?.format_name || '',
    sizeBytes: size,
    video: video ? {
      codec: video.codec_name || '',
      width: Number(video.width) || 0,
      height: Number(video.height) || 0,
      fps: parseFps(video.avg_frame_rate),
      bitrate: Number(video.bit_rate || data.format?.bit_rate) || null,
    } : null,
    audio: audioStreams.map((s) => ({
      codec: s.codec_name || '',
      channels: Number(s.channels) || 0,
      language: s.tags?.language || '',
      title: s.tags?.title || '',
      default: s.disposition?.default === 1,
    })),
    subtitles: subStreams.map((s) => ({
      codec: s.codec_name || '',
      language: s.tags?.language || '',
      title: s.tags?.title || '',
      forced: s.disposition?.forced === 1,
      default: s.disposition?.default === 1,
    })),
  };
}
