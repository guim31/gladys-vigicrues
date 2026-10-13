// -----------------------------------------------------------------------------
// Distances on the Earth, enough for "the stations around my house".
// -----------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE = 111.32;
const rad = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle distance in km (haversine). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Grid the box bounds are rounded out to, in degrees (about 5 km): the box sent
// to Hub'Eau is not centred on the house.
const GRID_DEGREES = 0.05;
const down = (value) => Math.floor(value / GRID_DEGREES) * GRID_DEGREES;
const up = (value) => Math.ceil(value / GRID_DEGREES) * GRID_DEGREES;

/**
 * The box `[minLon, minLat, maxLon, maxLat]` holding a circle of `km` around a
 * point, its bounds rounded out to a 0.05° grid. The stations are then sorted
 * by their real distance.
 */
export function boxAround(latitude, longitude, km) {
  const dLat = km / KM_PER_DEGREE;
  const dLon = km / (KM_PER_DEGREE * Math.max(0.01, Math.cos(rad(latitude))));
  return [
    down(longitude - dLon),
    down(latitude - dLat),
    up(longitude + dLon),
    up(latitude + dLat),
  ].map((value) => Number(value.toFixed(2)));
}
