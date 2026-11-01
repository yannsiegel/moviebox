// Smoke tests for the filename parser. The parser is deliberately tolerant,
// so these check the common schemes rather than every edge case.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilename, isVideoFile } from '../src/parse-filename.js';

test('recognises common video extensions', () => {
  assert.equal(isVideoFile('a.mkv'), true);
  assert.equal(isVideoFile('a.MP4'), true);
  assert.equal(isVideoFile('a.srt'), false);
  assert.equal(isVideoFile('a'), false);
});

test('parses a plain movie with year in parens', () => {
  const parsed = parseFilename('/media/movies/The Matrix (1999).mkv');
  assert.equal(parsed.kind, 'movie');
  assert.equal(parsed.year, 1999);
  assert.ok(parsed.title.toLowerCase().includes('matrix'));
});

test('parses a movie with dots-and-quality-tags', () => {
  const parsed = parseFilename('/x/Inception.2010.1080p.BluRay.x264-GROUP.mkv');
  assert.equal(parsed.kind, 'movie');
  assert.equal(parsed.year, 2010);
  assert.equal(parsed.title.toLowerCase(), 'inception');
});

test('parses S01E02 episodes', () => {
  const parsed = parseFilename('/media/tv/Breaking Bad/Breaking.Bad.S01E02.720p.mkv');
  assert.equal(parsed.kind, 'episode');
  assert.equal(parsed.season, 1);
  assert.equal(parsed.episode, 2);
  assert.ok(parsed.showTitle.toLowerCase().includes('breaking'));
});

test('parses 1x02 episodes', () => {
  const parsed = parseFilename('/x/The.Office/The.Office.1x02.mp4');
  assert.equal(parsed.kind, 'episode');
  assert.equal(parsed.season, 1);
  assert.equal(parsed.episode, 2);
});

test('parses "Season N/01 - title" folder scheme', () => {
  const parsed = parseFilename('/media/tv/Breaking Bad/Season 2/03 - Bit by a Dead Bee.mkv');
  assert.equal(parsed.kind, 'episode');
  assert.equal(parsed.season, 2);
  assert.equal(parsed.episode, 3);
  assert.ok(parsed.showTitle.toLowerCase().includes('breaking'));
});

test('falls back to filename for a yearless movie', () => {
  const parsed = parseFilename('/x/Shrek.mkv');
  assert.equal(parsed.kind, 'movie');
  assert.equal(parsed.year, null);
  assert.equal(parsed.title.toLowerCase(), 'shrek');
});
