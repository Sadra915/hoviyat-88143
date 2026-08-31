/**
 * smartspace.js
 * نوار هوشمند بالای صفحه اصلی: آب‌وهوای واقعی شهر کاربر (Open-Meteo، رایگان و
 * بدون کلید) + یادداشت سریع (ذخیره‌شده در Supabase برای همان کاربر).
 */
import { supabase, auth } from "./supabase-init.js";
import { icon } from "./icons.js";

const WMO_TEXT = {
  0: "آسمان صاف", 1: "کمی ابری", 2: "نیمه ابری", 3: "ابری",
  45: "مه", 48: "مه یخ‌زده",
  51: "نم‌نم باران", 53: "نم‌نم باران", 55: "نم‌نم باران شدید",
  61: "باران سبک", 63: "باران", 65: "باران شدید",
  71: "برف سبک", 73: "برف", 75: "برف شدید",
  80: "رگبار", 81: "رگبار", 82: "رگبار شدید",
  95: "رعدوبرق",
};

async function geocodeCity(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=fa`;
  const res = await fetch(url);
  const json = await res.json();
  const r = json.results?.[0];
  return r ? { lat: r.latitude, lon: r.longitude, name: r.name } : null;
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;
  const res = await fetch(url);
  const json = await res.json();
  return json.current;
}

function escapeAttr(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function renderSmartSpace(container) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const { data: userRow } = await supabase.from("profiles").select("weather_city").eq("id", uid).maybeSingle();
  const cityName = userRow?.weather_city || "بیرجند";
  const { data: noteRow } = await supabase.from("notes").select("text").eq("user_id", uid).maybeSingle();
  const noteText = noteRow?.text || "";

  container.innerHTML = `
    <div class="smartspace">
      <div class="ss-weather" id="ssWeather">
        <span class="ss-icon-badge ss-icon-weather">${icon("cloudSun", { size: 17 })}</span>
        <div class="ss-weather-text">
          <span id="ssCity">${escapeAttr(cityName)}</span>
          <small>در حال دریافت…</small>
        </div>
      </div>
      <div class="ss-note">
        <span class="ss-icon-badge ss-icon-note">${icon("stickyNote", { size: 16 })}</span>
        <div class="ss-note-body">
          <small class="ss-note-label">یادداشت سریع</small>
          <input id="ssNoteInput" class="ss-note-input" placeholder="یادداشت سریع…" value="${escapeAttr(noteText)}">
        </div>
      </div>
    </div>
  `;

  let noteTimer = null;
  document.getElementById("ssNoteInput").addEventListener("input", e => {
    clearTimeout(noteTimer);
    const text = e.target.value;
    noteTimer = setTimeout(() => {
      supabase.from("notes").upsert({ user_id: uid, text, updated_at: new Date().toISOString() });
    }, 600);
  });

  try {
    const geo = await geocodeCity(cityName);
    if (!geo) throw new Error("شهر پیدا نشد");
    const w = await fetchWeather(geo.lat, geo.lon);
    const small = container.querySelector("#ssWeather small");
    if (small && w) {
      small.textContent = `${Math.round(w.temperature_2m)}° · ${WMO_TEXT[w.weather_code] || "—"}`;
    }
  } catch (e) {
    const small = container.querySelector("#ssWeather small");
    if (small) small.textContent = "در دسترس نیست";
  }
}

export async function setWeatherCity(cityName) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await supabase.from("profiles").update({ weather_city: cityName }).eq("id", uid);
}
