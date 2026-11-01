import { MongoClient, ObjectId } from 'mongodb';
import { config } from './config.js';
import { activeTenant } from './tenant.js';

const client = new MongoClient(config.mongoUrl);
let database = null;

/**
 * Collections every user has for themselves.
 *
 * - movies: standalone films
 * - shows: series parents (one per show)
 * - episodes: individual episodes (linked to a show + season)
 * - jobs: downloads, scans, metadata fetches, transcodes
 * - subscriptions: watched sources (a series abo, a feed, a folder abo)
 * - watchlists: user-made lists ("Weihnachten", "Noch nicht gesehen")
 * - settings: per-user preferences
 * - plays: watch history (what, when, how far)
 * - resume: current resume position per media item
 */
export const USER_COLLECTIONS = [
  'movies',
  'shows',
  'episodes',
  'jobs',
  'subscriptions',
  'watchlists',
  'settings',
  'plays',
  'resume',
];

/**
 * The current user's collections: db.movies is "movies" for the first admin and "u<id>_movies" for
 * everyone else (one database, so the existing MongoDB user needs no new permissions).
 */
export const db = new Proxy({}, {
  get(_, name) {
    if (typeof name !== 'string' || !USER_COLLECTIONS.includes(name)) return undefined;
    return database.collection(`${activeTenant()?.prefix ?? ''}${name}`);
  },
});

/** Shared by all users: accounts, login tokens and invitations. */
export const central = {
  get users() { return database.collection('users'); },
  get tokens() { return database.collection('tokens'); },
  get invites() { return database.collection('invites'); },
};

export async function connectDb() {
  await client.connect();
  database = client.db(config.mongoDb);
  await central.users.createIndex({ username: 1 }, { unique: true });
  await central.tokens.createIndex({ userId: 1 });
  await central.invites.createIndex({ expiresAt: 1 });
}

/** Indexes of one user's collections (run inside withTenant). */
export async function prepareUserDb() {
  // Movies and episodes are keyed by a stable sourceId (hash of filepath for local files,
  // provider:id for downloaded ones). addedAt + title indexes drive the main library views.
  await db.movies.createIndex({ sourceId: 1 }, { unique: true });
  await db.movies.createIndex({ addedAt: -1 });
  await db.movies.createIndex({ title: 1 });
  await db.movies.createIndex({ tmdbId: 1 });
  await db.movies.createIndex({ liked: 1, likedAt: -1 });

  await db.shows.createIndex({ sourceId: 1 }, { unique: true });
  await db.shows.createIndex({ tmdbId: 1 });
  await db.shows.createIndex({ title: 1 });

  await db.episodes.createIndex({ sourceId: 1 }, { unique: true });
  await db.episodes.createIndex({ showId: 1, season: 1, episode: 1 });
  await db.episodes.createIndex({ addedAt: -1 });
  await db.episodes.createIndex({ liked: 1, likedAt: -1 });

  await db.jobs.createIndex({ status: 1, priority: -1, createdAt: 1 });
  await db.jobs.createIndex({ sourceId: 1 });

  await db.subscriptions.createIndex({ showId: 1 }, { unique: true });
  await db.subscriptions.createIndex({ tmdbId: 1 });

  await db.watchlists.createIndex({ createdAt: -1 });

  await db.plays.createIndex({ at: -1 });
  await db.resume.createIndex({ mediaId: 1 }, { unique: true });

  // Jobs that were running when the server stopped would otherwise be stuck forever.
  await db.jobs.updateMany({ status: 'running' }, { $set: { status: 'queued' }, $unset: { progress: '' } });
}

/** Removes all of a user's collections (when the account is deleted). */
export async function dropUserDb(prefix) {
  if (!prefix) throw new Error('The first admin cannot be deleted');
  for (const name of USER_COLLECTIONS) await database.collection(`${prefix}${name}`).drop().catch(() => {});
}

export async function closeDb() {
  await client.close();
}

export function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Converts a Mongo document into the JSON shape the app expects (`id` instead of `_id`). */
export function serialize(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  for (const [key, value] of Object.entries(rest)) {
    if (value instanceof ObjectId) rest[key] = value.toString();
    if (Array.isArray(value)) rest[key] = value.map((v) => (v instanceof ObjectId ? v.toString() : v));
  }
  return { id: _id.toString(), ...rest };
}
