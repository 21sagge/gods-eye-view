import test from 'node:test';
import assert from 'node:assert/strict';
import { createIngvEarthquakeSource, INGV_ITALY_BBOX } from './ingvSource.js';

const REAL_SHAPE_PAYLOAD = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        eventId: 47168452,
        time: '2026-09-14T21:27:49.600000',
        mag: 0.7,
        type: 'earthquake',
        place: '4 km SE Camerino (MC)',
      },
      geometry: { type: 'Point', coordinates: [13.0995, 43.1088, 12.1] },
    },
    {
      // Non-earthquake catalog entries (e.g. quarry blasts) must be excluded.
      type: 'Feature',
      properties: {
        eventId: 99999,
        time: '2026-09-14T20:00:00.000000',
        mag: 2.0,
        type: 'quarry blast',
        place: 'Somewhere',
      },
      geometry: { type: 'Point', coordinates: [12, 44, 1] },
    },
  ],
};

test('requests a bounded 24h Italy window and surfaces normalized rows', async () => {
  let capturedUrl;
  const source = createIngvEarthquakeSource({
    now: () => Date.UTC(2026, 8, 15, 0, 0, 0),
    fetchImpl: async (url) => {
      capturedUrl = new URL(url);
      return { ok: true, json: async () => REAL_SHAPE_PAYLOAD };
    },
  });
  const rows = await source.getSnapshot();

  assert.equal(capturedUrl.origin + capturedUrl.pathname, 'https://webservices.ingv.it/fdsnws/event/1/query');
  assert.equal(capturedUrl.searchParams.get('format'), 'geojson');
  assert.equal(capturedUrl.searchParams.get('starttime'), '2026-09-14T00:00:00.000Z');
  assert.equal(capturedUrl.searchParams.get('endtime'), '2026-09-15T00:00:00.000Z');
  assert.equal(capturedUrl.searchParams.get('minmagnitude'), '1.5');
  assert.equal(capturedUrl.searchParams.get('minlatitude'), String(INGV_ITALY_BBOX.minLatitude));
  assert.equal(capturedUrl.searchParams.get('maxlongitude'), String(INGV_ITALY_BBOX.maxLongitude));

  assert.deepEqual(rows, [
    {
      stableId: 'ingv-47168452',
      eventId: '47168452',
      lon: 13.0995,
      lat: 43.1088,
      depthKm: 12.1,
      mag: 0.7,
      place: '4 km SE Camerino (MC)',
      time: Date.UTC(2026, 8, 14, 21, 27, 49, 600),
    },
  ]);
});

test('a custom minMagnitude and bbox are forwarded to the request', async () => {
  let capturedUrl;
  const source = createIngvEarthquakeSource({
    minMagnitude: 3,
    bbox: { minLatitude: 1, maxLatitude: 2, minLongitude: 3, maxLongitude: 4 },
    fetchImpl: async (url) => {
      capturedUrl = new URL(url);
      return { ok: true, json: async () => ({ features: [] }) };
    },
  });
  await source.getSnapshot();
  assert.equal(capturedUrl.searchParams.get('minmagnitude'), '3');
  assert.equal(capturedUrl.searchParams.get('minlatitude'), '1');
  assert.equal(capturedUrl.searchParams.get('maxlongitude'), '4');
});

test('an HTTP failure is rejected with the status code', async () => {
  const source = createIngvEarthquakeSource({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(source.getSnapshot(), /INGV HTTP 503/);
});

test('a malformed successful response is never accepted as an empty snapshot', async () => {
  for (const payload of [{}, { features: null }, { features: {} }]) {
    const source = createIngvEarthquakeSource({
      fetchImpl: async () => ({ ok: true, json: async () => payload }),
    });
    await assert.rejects(source.getSnapshot(), /Malformed INGV response/);
  }
});

test('response-body completion honors cancellation without replacing records', async () => {
  const abort = new AbortController();
  const source = createIngvEarthquakeSource({
    fetchImpl: async () => ({
      ok: true,
      json: async () => {
        abort.abort();
        return { features: [] };
      },
    }),
  });
  await assert.rejects(source.getSnapshot({ signal: abort.signal }), {
    name: 'AbortError',
  });
});
