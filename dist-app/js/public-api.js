/* Hoviyat public API adapters. No secret API keys are stored in the browser. */
(() => {
  "use strict";
  const cache = new Map();
  const ttl = 5 * 60 * 1000;

  async function cached(key, loader) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = await loader();
    cache.set(key, { at: Date.now(), value });
    return value;
  }

  async function weather(lat, lon) {
    const key = `weather:${lat}:${lon}`;
    return cached(key, async () => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: String(lat), longitude: String(lon), current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
        hourly: "temperature_2m,precipitation_probability", forecast_days: "1", timezone: "auto",
      });
      const r = await fetch(url);
      if (!r.ok) throw new Error("Weather API failed");
      return r.json();
    });
  }

  async function geocode(city) {
    const q = String(city || "").trim();
    if (!q) throw new Error("نام شهر خالی است");
    const key = `geo:${q.toLowerCase()}`;
    return cached(key, async () => {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.search = new URLSearchParams({ name: q, count: "5", language: "fa", format: "json" });
      const r = await fetch(url);
      if (!r.ok) throw new Error("Geocoding API failed");
      return r.json();
    });
  }

  window.HoviyatAPI = Object.freeze({ weather, geocode });
})();
