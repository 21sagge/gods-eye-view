// The same physical event can be reported by more than one network with
// different ids and slightly different magnitude/location estimates — merge
// window for treating two rows from different sources as one earthquake.
const DEDUPE_TIME_WINDOW_MS = 2 * 60 * 1000;
const DEDUPE_DISTANCE_KM = 40;

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

/**
 * Collapse the same physical event reported by more than one source. Rows
 * are compared in input order and the first-seen row is kept, so pass the
 * most-authoritative source's rows first.
 */
export function dedupeEarthquakeRows(rows) {
  const kept = [];
  for (const row of rows) {
    const isDuplicate = kept.some((existing) => {
      if (row.time == null || existing.time == null) return false;
      if (Math.abs(row.time - existing.time) > DEDUPE_TIME_WINDOW_MS)
        return false;
      return (
        haversineKm(row.lat, row.lon, existing.lat, existing.lon) <=
        DEDUPE_DISTANCE_KM
      );
    });
    if (!isDuplicate) kept.push(row);
  }
  return kept;
}

/**
 * Merge several earthquake sources into one 24h snapshot. Tolerant of
 * partial failure: as long as at least one source resolves, its rows are
 * returned rather than discarding the whole update over an unrelated
 * source's outage. Only throws when every source fails.
 */
export function createCombinedEarthquakeSource({ sources } = {}) {
  if (!Array.isArray(sources) || sources.length === 0)
    throw new TypeError('Combined earthquake source requires at least one source');
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const settled = await Promise.allSettled(
        sources.map((source) => source.getSnapshot({ signal })),
      );
      signal?.throwIfAborted();
      const rows = [];
      let firstError = null;
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') rows.push(...outcome.value);
        else firstError ??= outcome.reason;
      }
      if (rows.length === 0 && firstError) throw firstError;
      return dedupeEarthquakeRows(rows);
    },
  };
}
