// Daily backup of each user's database collections (library, watch history, settings).
// Media files are not backed up here - they are large and reproducible from the source folder;
// put them on a separate storage with its own backup if they matter.

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { db, USER_COLLECTIONS } from './db.js';
import { activeTenant } from './tenant.js';
import { forEachUser } from './users.js';

const DAY_MS = 24 * 3_600_000;

async function backupOne() {
  const tenant = activeTenant();
  if (!tenant) return false;
  await fs.mkdir(tenant.backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(tenant.backupDir, `moviebox-${stamp}.json`);

  const dump = { version: 1, createdAt: new Date().toISOString(), user: tenant.user.username, collections: {} };
  for (const name of USER_COLLECTIONS) {
    dump.collections[name] = await db[name].find({}).toArray();
  }
  await fs.writeFile(file, JSON.stringify(dump), { mode: 0o600 });

  // keep the last BACKUP_KEEP files
  const files = (await fs.readdir(tenant.backupDir)).filter((f) => f.startsWith('moviebox-') && f.endsWith('.json')).sort();
  const extra = files.length - config.backupKeep;
  for (let i = 0; i < extra; i++) await fs.rm(path.join(tenant.backupDir, files[i]), { force: true });
  return true;
}

/** One backup pass across all accounts. */
export async function backupAll() {
  await forEachUser(backupOne, 'Backup');
}

/** Starts a daily backup loop (first run after WORKER_START_DELAY_MS). */
export function startBackups() {
  setTimeout(async function tick() {
    try { await backupAll(); } catch (err) { console.error(`Backup: ${err.message}`); }
    setTimeout(tick, DAY_MS);
  }, config.workerStartDelayMs);
}
