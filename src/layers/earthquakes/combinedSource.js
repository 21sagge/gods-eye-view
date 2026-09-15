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

function isSameEvent(a, b) {
  if (a.time == null || b.time == null) return false;
  if (Math.abs(a.time - b.time) > DEDUPE_TIME_WINDOW_MS) return false;
  return haversineKm(a.lat, a.lon, b.lat, b.lon) <= DEDUPE_DISTANCE_KM;
}

/**
 * Collapse the same physical event reported by more than one source.
 * `groups` is one row array per source (most-authoritative source first) —
 * rows are compared only against rows from a DIFFERENT group, never against
 * rows from their own group, so two distinct events from the same network
 * that happen to land close in time and space are never merged into one.
 * Within a match, the first-seen row (earliest group, then earliest row) is
 * kept.
 */
export function dedupeEarthquakeRows(groups) {
  const kept = [];
  groups.forEach((rows, groupIndex) => {
    for (const row of rows) {
      const isDuplicate = kept.some(
        (entry) => entry.groupIndex !== groupIndex && isSameEvent(row, entry.row),
      );
      if (!isDuplicate) kept.push({ row, groupIndex });
    }
  });
  return kept.map((entry) => entry.row);
}

/**
 * Merge several earthquake sources into one 24h snapshot. Tolerant of
 * partial failure: as long as at least one source resolves — even to an
 * empty snapshot — its rows are returned rather than discarding the whole
 * update over an unrelated source's outage. Only throws when every source
 * fails.
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
      const groups = [];
      let firstError = null;
      let anyFulfilled = false;
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          anyFulfilled = true;
          groups.push(outcome.value);
        } else {
          firstError ??= outcome.reason;
        }
      }
      if (!anyFulfilled) throw firstError;
      return dedupeEarthquakeRows(groups);
    },
  };
}
