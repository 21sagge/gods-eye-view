import {
  createEarthquakesLayer as createLayer,
  createUsgsEarthquakeSource,
  createIngvEarthquakeSource,
  createCombinedEarthquakeSource,
} from '../layers/earthquakes/index.js';
import {
  clearOverlaySource,
  setOverlayEntries,
  setOverlaySourceVisible,
} from '../overlays/worldOverlay.js';
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
  overlayHost = {
    setEntries: setOverlayEntries,
    setVisible: setOverlaySourceVisible,
    clearSource: clearOverlaySource,
  },
} = {}) {
  return createLayer({ source, overlayHost, sourceLabel });
}
export default createEarthquakesLayer();
