import { normalizeIngvEarthquakeSnapshot } from './model.js';

const API_URL = 'https://webservices.ingv.it/fdsnws/event/1/query';

// Roughly covers mainland Italy plus Sicily and Sardinia.
export const INGV_ITALY_BBOX = {
  minLongitude: 6.0,
  maxLongitude: 19.0,
  minLatitude: 35.2,
  maxLatitude: 47.3,
};

// Far below USGS's global M2.5+ floor — INGV's own network is dense enough
// over Italy that this stays a small, bounded request.
export const INGV_DEFAULT_MIN_MAGNITUDE = 1.5;

function buildUrl({ nowMs, minMagnitude, bbox }) {
  const url = new URL(API_URL);
  url.searchParams.set('format', 'geojson');
  url.searchParams.set('starttime', new Date(nowMs - 86_400_000).toISOString());
  url.searchParams.set('endtime', new Date(nowMs).toISOString());
  url.searchParams.set('minmagnitude', String(minMagnitude));
  url.searchParams.set('minlatitude', String(bbox.minLatitude));
  url.searchParams.set('maxlatitude', String(bbox.maxLatitude));
  url.searchParams.set('minlongitude', String(bbox.minLongitude));
  url.searchParams.set('maxlongitude', String(bbox.maxLongitude));
  url.searchParams.set('orderby', 'time');
  url.searchParams.set('limit', '1000');
  return url.toString();
}

/**
 * Request and validate a rolling-24h INGV snapshot bounded to Italy — denser
 * local detail (down to M1.5 by default) than the global USGS feed reports
 * there. Meant to be merged with `createUsgsEarthquakeSource` via
 * `createCombinedEarthquakeSource`, not used standalone as the only feed.
 */
export function createIngvEarthquakeSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  minMagnitude = INGV_DEFAULT_MIN_MAGNITUDE,
  bbox = INGV_ITALY_BBOX,
  now = () => Date.now(),
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const url = buildUrl({ nowMs: now(), minMagnitude, bbox });
      const response = await fetchImpl(url, { signal });
      if (!response.ok) throw new Error(`INGV HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      const rows = normalizeIngvEarthquakeSnapshot(payload);
      if (!rows) throw new Error('Malformed INGV response');
      return rows;
    },
  };
}
