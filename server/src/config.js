import path from 'node:path';
import { activeTenant } from './tenant.js';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name} (see .env.example)`);
    process.exit(1);
  }
  return value;
}

const mediaRoot = path.resolve(process.env.MEDIA_DIR || './media');
const backupRoot = path.resolve(process.env.BACKUP_DIR || path.join(path.dirname(mediaRoot), 'backups'));

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3200),
  apiToken: required('API_TOKEN'),
  mongoUrl: process.env.MONGO_URL || 'mongodb://127.0.0.1:27017',
  mongoDb: process.env.MONGO_DB || 'moviebox',
  /** MEDIA_DIR itself; every user has an area below it (the first admin: MEDIA_DIR itself, others users/<id>) */
  mediaRoot,
  backupRoot,
  // the folders of the current user (see tenant.js)
  get mediaDir() {
    return activeTenant()?.mediaDir ?? mediaRoot;
  },
  get videoDir() {
    return activeTenant()?.videoDir ?? path.join(mediaRoot, 'video');
  },
  get posterDir() {
    return activeTenant()?.posterDir ?? path.join(mediaRoot, 'posters');
  },
  get subtitleDir() {
    return activeTenant()?.subtitleDir ?? path.join(mediaRoot, 'subtitles');
  },
  get thumbnailDir() {
    return activeTenant()?.thumbnailDir ?? path.join(mediaRoot, 'thumbnails');
  },
  get transcodeDir() {
    return activeTenant()?.transcodeDir ?? path.join(mediaRoot, 'transcodes');
  },
  // External binaries
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  ytdlpExtraArgs: (process.env.YTDLP_EXTRA_ARGS || '').split(' ').filter(Boolean),
  // Pause before each download (seconds, randomised up to twice the value); makes the server look less like a bot.
  downloadPauseSeconds: Number(process.env.DOWNLOAD_PAUSE_SECONDS ?? 2),
  // Blocked downloads are tried again by themselves after this many hours, at most twice.
  autoRetryHours: Number(process.env.AUTO_RETRY_HOURS ?? 6),
  autoRetryCheckMs: Number(process.env.AUTO_RETRY_CHECK_MS || 3_600_000),
  // Folder scanner interval (seconds). The scanner also runs on inotify events; this is the safety net.
  scanIntervalSeconds: Number(process.env.SCAN_INTERVAL_SECONDS || 300),
  // When set, nginx serves the video files itself (X-Accel-Redirect) instead of Node streaming them.
  accelRedirectPrefix: process.env.ACCEL_REDIRECT_PREFIX || '',
  // Metadata (TMDB is the primary source; free API key, generous limits).
  tmdbApiKey: process.env.TMDB_API_KEY || '',
  tmdbLanguage: process.env.TMDB_LANGUAGE || 'de-DE',
  // Transcoding ceiling. No GPU on this install -> keep it modest; direct-play covers nearly everything.
  maxTranscodeHeight: Number(process.env.MAX_TRANSCODE_HEIGHT || 1080),
  // Number of concurrent transcode jobs. CPU-only means 1 is the honest answer.
  transcodeConcurrency: Number(process.env.TRANSCODE_CONCURRENCY || 1),
  // Preview downloads live in <videoDir>/preview/ and are deleted after this many hours.
  previewKeepHours: Number(process.env.PREVIEW_KEEP_HOURS || 48),
  // Daily backup of the database; the last BACKUP_KEEP files are kept.
  get backupDir() {
    return activeTenant()?.backupDir ?? backupRoot;
  },
  backupKeep: Number(process.env.BACKUP_KEEP || 7),
  // External services; only changed by the tests.
  tmdbApi: process.env.TMDB_API || 'https://api.themoviedb.org/3',
  tmdbImageBase: process.env.TMDB_IMAGE_BASE || 'https://image.tmdb.org/t/p',
  openSubtitlesApi: process.env.OPEN_SUBTITLES_API || 'https://api.opensubtitles.com/api/v1',
  openSubtitlesApiKey: process.env.OPEN_SUBTITLES_API_KEY || '',
  openSubtitlesUsername: process.env.OPEN_SUBTITLES_USERNAME || '',
  openSubtitlesPassword: process.env.OPEN_SUBTITLES_PASSWORD || '',
  // TorrentIO base URL (default is the public one; swap in a mirror or self-hosted instance if ever needed)
  torrentioBase: process.env.TORRENTIO_BASE || 'https://torrentio.strem.fun',
  // delay before background workers start after boot (tests use a short one)
  workerStartDelayMs: Number(process.env.WORKER_START_DELAY_MS || 20_000),
};
