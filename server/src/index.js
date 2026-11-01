import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { connectDb, closeDb } from './db.js';
import { api } from './routes.js';
import { startBackups } from './maintenance.js';
import { startScanner } from './scanner.js';
import { startMetadataWorker } from './metadata.js';
import { startDownloader } from './downloader.js';
import { startCleanup } from './cleanup.js';
import { startSubscriptions } from './subscriptions.js';
import { ensureAdmin, listUsers, prepareUser } from './users.js';

await connectDb();
// existing data becomes the admin's area; then folders and indexes of every account
await ensureAdmin();
for (const user of await listUsers()) await prepareUser(user);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use('/api', api);

// the web player (static files, no secrets: it asks for the token itself)
const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});
app.use(express.static(webDir, { index: 'index.html', maxAge: '1h' }));

const server = app.listen(config.port, config.host, () => {
  console.log(`MovieBox listening on http://${config.host}:${config.port} (media: ${config.mediaRoot})`);
});

startBackups();
startScanner();
startMetadataWorker();
startDownloader();
startCleanup();
startSubscriptions();

async function shutdown() {
  server.close();
  await closeDb();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
