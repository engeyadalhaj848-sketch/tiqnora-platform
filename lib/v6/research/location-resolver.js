/**
 * Simple expandable city → geo bias resolver (Saudi-first).
 * Used for Google Places locationBias / locationRestriction.
 */

const CITY_COORDS = Object.freeze({
  'المدينة المنورة': { lat: 24.5247, lng: 39.5692, radius_m: 25000 },
  'المدينة': { lat: 24.5247, lng: 39.5692, radius_m: 25000 },
  madinah: { lat: 24.5247, lng: 39.5692, radius_m: 25000 },
  'medina': { lat: 24.5247, lng: 39.5692, radius_m: 25000 },
  الرياض: { lat: 24.7136, lng: 46.6753, radius_m: 30000 },
  riyadh: { lat: 24.7136, lng: 46.6753, radius_m: 30000 },
  جدة: { lat: 21.4858, lng: 39.1925, radius_m: 30000 },
  jeddah: { lat: 21.4858, lng: 39.1925, radius_m: 30000 },
  مكة: { lat: 21.3891, lng: 39.8579, radius_m: 25000 },
  'مكة المكرمة': { lat: 21.3891, lng: 39.8579, radius_m: 25000 },
  makkah: { lat: 21.3891, lng: 39.8579, radius_m: 25000 },
  الدمام: { lat: 26.4207, lng: 50.0888, radius_m: 25000 },
  dammam: { lat: 26.4207, lng: 50.0888, radius_m: 25000 },
  الخبر: { lat: 26.2172, lng: 50.1971, radius_m: 20000 },
  khobar: { lat: 26.2172, lng: 50.1971, radius_m: 20000 },
  الطائف: { lat: 21.2703, lng: 40.4158, radius_m: 20000 },
  taif: { lat: 21.2703, lng: 40.4158, radius_m: 20000 },
  تبوك: { lat: 28.3998, lng: 36.5700, radius_m: 20000 },
  tabuk: { lat: 28.3998, lng: 36.5700, radius_m: 20000 },
  أبها: { lat: 18.2164, lng: 42.5053, radius_m: 20000 },
  abha: { lat: 18.2164, lng: 42.5053, radius_m: 20000 }
});

export function resolveCityLocation(city) {
  if (!city || typeof city !== 'string') return null;
  const key = city.trim();
  if (CITY_COORDS[key]) return { ...CITY_COORDS[key], city: key };
  const lower = key.toLowerCase();
  if (CITY_COORDS[lower]) return { ...CITY_COORDS[lower], city: key };
  // partial Arabic/English contains
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (key.includes(name) || name.includes(key) || lower.includes(String(name).toLowerCase())) {
      return { ...coords, city: key };
    }
  }
  return null;
}

export function buildLocationBias(city, overrides = {}) {
  if (overrides.latitude != null && overrides.longitude != null) {
    return {
      circle: {
        center: {
          latitude: Number(overrides.latitude),
          longitude: Number(overrides.longitude)
        },
        radius: Number(overrides.radius_m || overrides.radius || 20000)
      }
    };
  }
  const resolved = resolveCityLocation(city);
  if (!resolved) return null;
  return {
    circle: {
      center: { latitude: resolved.lat, longitude: resolved.lng },
      radius: Number(overrides.radius_m || resolved.radius_m || 25000)
    }
  };
}

export default { resolveCityLocation, buildLocationBias };
