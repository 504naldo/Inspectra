/**
 * Geo helpers for route-aware scheduling.
 */

import type { LatLng } from "./map";

/**
 * Great-circle distance between two coordinates, in kilometers.
 * Used as a fast, dependency-free proxy for drive-time when ranking
 * candidates by proximity — avoids an external API round-trip per suggestion.
 */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const EARTH_RADIUS_KM = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
