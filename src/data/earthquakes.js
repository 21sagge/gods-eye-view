import {
  createUsgsEarthquakeSource,
  createIngvEarthquakeSource,
  createCombinedEarthquakeSource,
} from '../layers/earthquakes/index.js';
import { createApplicationEarthquakes } from '../app/layers/earthquakes.js';
export * from '../layers/earthquakes/index.js';
/**
 * Wire the standalone source and application overlay owner. Defaults to
 * USGS (global, M2.5+) merged with INGV (Italy, down to M1.5) for denser
 * detail there — see DATA_SOURCES.md.
 */
export function createEarthquakesLayer({
  source = createCombinedEarthquakeSource({
    sources: [createUsgsEarthquakeSource(), createIngvEarthquakeSource()],
  }),
  sourceLabel = 'USGS + INGV',
  ...options
} = {}) {
  return createApplicationEarthquakes({ source, sourceLabel, ...options });
}
export default createEarthquakesLayer();
