import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCombinedEarthquakeSource,
  dedupeEarthquakeRows,
} from './combinedSource.js';

function row(overrides) {
  return {
    stableId: 'x', eventId: 'x', lon: 0, lat: 0, depthKm: 5,
    mag: 4, place: 'Fixture', time: 1_000_000, ...overrides,
  };
}
function source(getSnapshot) {
  return { getSnapshot };
}

test('rows from every source are merged', async () => {
  const usgs = source(async () => [row({ stableId: 'us1', lat: 61, lon: -150 })]);
  const ingv = source(async () => [row({ stableId: 'ingv-1', lat: 43, lon: 13, time: 5_000_000 })]);
  const combined = createCombinedEarthquakeSource({ sources: [usgs, ingv] });
  const rows = await combined.getSnapshot();
  assert.deepEqual(rows.map((r) => r.stableId).sort(), ['ingv-1', 'us1']);
});

test('one failing source does not discard rows from a working one', async () => {
  const usgs = source(async () => [row({ stableId: 'us1' })]);
  const ingv = source(async () => { throw new Error('INGV HTTP 503'); });
  const combined = createCombinedEarthquakeSource({ sources: [usgs, ingv] });
  const rows = await combined.getSnapshot();
  assert.deepEqual(rows.map((r) => r.stableId), ['us1']);
});

test('a source that legitimately resolves empty still counts as success, not failure', async () => {
  const usgs = source(async () => []);
  const ingv = source(async () => { throw new Error('INGV HTTP 503'); });
  const combined = createCombinedEarthquakeSource({ sources: [usgs, ingv] });
  assert.deepEqual(await combined.getSnapshot(), []);
});

test('every source failing rejects with the first-listed source\'s error', async () => {
  const usgs = source(async () => { throw new Error('USGS HTTP 503'); });
  const ingv = source(async () => { throw new Error('INGV HTTP 503'); });
  const combined = createCombinedEarthquakeSource({ sources: [usgs, ingv] });
  await assert.rejects(combined.getSnapshot(), /USGS HTTP 503/);
});

test('at least one source is required', () => {
  assert.throws(() => createCombinedEarthquakeSource({ sources: [] }), TypeError);
  assert.throws(() => createCombinedEarthquakeSource({}), TypeError);
});

test('dedupe: the same event reported by two different sources is collapsed, first group wins', () => {
  const usgsRow = row({ stableId: 'us1', lat: 43.10, lon: 13.10, time: 1_000_000, mag: 4.5 });
  const ingvRow = row({ stableId: 'ingv-1', lat: 43.11, lon: 13.11, time: 1_020_000, mag: 4.3 });
  assert.deepEqual(dedupeEarthquakeRows([[usgsRow], [ingvRow]]), [usgsRow]);
  // Order matters: whichever group is listed first is kept.
  assert.deepEqual(dedupeEarthquakeRows([[ingvRow], [usgsRow]]), [ingvRow]);
});

test('dedupe: two distinct events from the SAME source are never merged, however close', () => {
  // A real aftershock sequence: same network, minutes apart, a few km apart.
  const a = row({ stableId: 'a', lat: 43.10, lon: 13.10, time: 1_000_000 });
  const b = row({ stableId: 'b', lat: 43.11, lon: 13.11, time: 1_020_000 });
  assert.deepEqual(dedupeEarthquakeRows([[a, b]]), [a, b]);
});

test('dedupe: far apart in time is not the same event', () => {
  const a = row({ stableId: 'a', time: 0 });
  const b = row({ stableId: 'b', time: 10 * 60 * 1000 });
  assert.deepEqual(dedupeEarthquakeRows([[a], [b]]), [a, b]);
});

test('dedupe: far apart in location is not the same event', () => {
  const a = row({ stableId: 'a', lat: 43, lon: 13, time: 0 });
  const b = row({ stableId: 'b', lat: 46, lon: 13, time: 0 });
  assert.deepEqual(dedupeEarthquakeRows([[a], [b]]), [a, b]);
});

test('dedupe: missing timestamps never match', () => {
  const a = row({ stableId: 'a', time: null });
  const b = row({ stableId: 'b', time: null });
  assert.deepEqual(dedupeEarthquakeRows([[a], [b]]), [a, b]);
});
