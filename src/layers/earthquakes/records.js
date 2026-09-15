/** Validate a complete feed before replacing the last good earthquake snapshot. */
export function normalizeEarthquakeSnapshot(geojson) {
  if (!Array.isArray(geojson?.features)) return null;
  const rows = [];
  const ids = new Set();
  for (const [index, feature] of geojson.features.entries()) {
    const coordinates = feature?.geometry?.coordinates;
    const properties = feature?.properties;
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !properties ||
      typeof properties !== 'object' ||
      Array.isArray(properties) ||
      (feature.geometry.type != null && feature.geometry.type !== 'Point')
    )
      return null;
    const [lon, lat, depthKm] = coordinates;
    const mag = properties.mag;
    if (
      !Number.isFinite(lon) ||
      Math.abs(lon) > 180 ||
      !Number.isFinite(lat) ||
      Math.abs(lat) > 90 ||
      (depthKm != null && !Number.isFinite(depthKm)) ||
      (mag != null && (!Number.isFinite(mag) || mag > 10))
    )
      return null;
    // A missing magnitude cannot establish that this event meets M2.5+.
    if (mag == null || mag < 2.5) continue;
    const stableId =
      feature.id == null || feature.id === ''
        ? `event-${index + 1}`
        : String(feature.id);
    if (ids.has(stableId)) return null;
    ids.add(stableId);
    rows.push({
      stableId,
      eventId: feature.id ?? null,
      lon,
      lat,
      depthKm: depthKm ?? null,
      mag,
      place: typeof properties.place === 'string' ? properties.place : null,
      time: Number.isFinite(properties.time) ? properties.time : null,
    });
  }
  return rows;
}

/**
 * INGV reports UTC timestamps without a zone suffix (e.g.
 * "2026-09-14T21:27:49.600000"), which `Date.parse` would otherwise read as
 * local time. Truncate to millisecond precision and force UTC explicitly.
 */
function parseIngvTimeMs(value) {
  const match = String(value ?? '').match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?/,
  );
  if (!match) return null;
  const millis = match[2] ? match[2].slice(0, 4) : '';
  const ms = Date.parse(`${match[1]}${millis}Z`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Validate a complete INGV FDSN event snapshot before it can replace the
 * displayed events. INGV's GeoJSON differs from USGS's: the event id and
 * timestamp live under `properties` (no top-level `feature.id`, no epoch-ms
 * `time`), and the catalog can include non-earthquake entries (e.g. quarry
 * blasts) that are excluded here rather than left for the caller to filter.
 */
export function normalizeIngvEarthquakeSnapshot(geojson) {
  if (!Array.isArray(geojson?.features)) return null;
  const rows = [];
  const ids = new Set();
  for (const feature of geojson.features) {
    const coordinates = feature?.geometry?.coordinates;
    const properties = feature?.properties;
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !properties ||
      typeof properties !== 'object' ||
      Array.isArray(properties) ||
      (feature.geometry.type != null && feature.geometry.type !== 'Point')
    )
      return null;
    if (properties.type != null && properties.type !== 'earthquake') continue;
    const [lon, lat, depthKm] = coordinates;
    const mag = properties.mag;
    if (
      !Number.isFinite(lon) ||
      Math.abs(lon) > 180 ||
      !Number.isFinite(lat) ||
      Math.abs(lat) > 90 ||
      (depthKm != null && !Number.isFinite(depthKm)) ||
      (mag != null && (!Number.isFinite(mag) || mag > 10))
    )
      return null;
    // A missing magnitude cannot establish that this event meets the caller's floor.
    if (mag == null) continue;
    const rawEventId = properties.eventId;
    if (rawEventId == null || rawEventId === '') return null;
    const stableId = `ingv-${rawEventId}`;
    if (ids.has(stableId)) return null;
    ids.add(stableId);
    rows.push({
      stableId,
      eventId: String(rawEventId),
      lon,
      lat,
      depthKm: depthKm ?? null,
      mag,
      place: typeof properties.place === 'string' ? properties.place : null,
      time: parseIngvTimeMs(properties.time),
    });
  }
  return rows;
}
