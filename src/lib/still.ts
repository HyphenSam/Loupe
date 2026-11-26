/** Reduced motion (PRODUCT.md): CSS stops the interface's own transitions (index.css); this covers motion that
 * scripts run. */

/** Whether the user asked for reduced motion. */
export const prefersStill = (): boolean => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Leaflet's animated zooms, fades, marker zooms and the drift after a drag, off when `still`. */
export const mapMotion = (still: boolean) => ({
  zoomAnimation: !still,
  fadeAnimation: !still,
  markerZoomAnimation: !still,
  inertia: !still,
})
