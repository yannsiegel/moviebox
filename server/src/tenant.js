// Every user has a completely separate MovieBox: own library, downloads, watchlists, subscriptions,
// statistics, backups and media folder. The user of the current request (or of the background job)
// is kept in an AsyncLocalStorage, and db.js / config.js pick that user's collections and folders
// from it. Code in between doesn't need to know about users at all.

import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';

const storage = new AsyncLocalStorage();

/**
 * A user's storage area. The first admin keeps the original names (no prefix, the media folder itself),
 * so an existing installation becomes the admin's area without moving anything.
 *
 * Video needs more folders than audio: the source files, posters/backdrops/logos, subtitle sidecars,
 * generated thumbnails (sprite sheets for seek preview) and transcoded variants for incompatible clients.
 */
export function tenantOf(user, mediaRoot, backupRoot) {
  const sub = user.prefix ? path.join('users', String(user._id)) : '';
  const mediaDir = path.join(mediaRoot, sub);
  return {
    id: String(user._id),
    user,
    prefix: user.prefix || '',
    mediaDir,
    videoDir: path.join(mediaDir, 'video'),
    posterDir: path.join(mediaDir, 'posters'),
    subtitleDir: path.join(mediaDir, 'subtitles'),
    thumbnailDir: path.join(mediaDir, 'thumbnails'),
    transcodeDir: path.join(mediaDir, 'transcodes'),
    backupDir: path.join(backupRoot, sub),
  };
}

/** The current user's area, or null outside a request/background job. */
export function currentTenant() {
  return storage.getStore() || null;
}

export function withTenant(tenant, fn) {
  return storage.run(tenant, fn);
}

/**
 * Outside any user (e.g. while the server starts) the admin's area is used. With MOVIEBOX_STRICT_TENANT=1
 * (the tests) this is an error instead, so a background job that forgot to pick a user is noticed.
 */
let fallback = null;

export function setFallbackTenant(tenant) {
  fallback = tenant;
}

export function activeTenant() {
  const t = storage.getStore();
  if (t) return t;
  if (process.env.MOVIEBOX_STRICT_TENANT === '1' && fallback) {
    throw new Error('No user context (a request or background job must run inside withTenant)');
  }
  return fallback;
}
