/**
 * smartspace.js
 * نوار هوشمند بالای صفحه اصلی: آب‌وهوای واقعی شهر کاربر (Open-Meteo، رایگان و
 * بدون کلید) + یادداشت سریع (ذخیره‌شده در Firestore برای همان کاربر).
 */
import { auth, db } from "./firebase-init.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

export async function renderSmartSpace(container) {
  const uid = auth.currentUser.uid;
  const userSnap = await getDoc(doc(db, "users", uid));
  const cityName = userSnap.data()?.weatherCity || "بیرجند";
  const noteSnap = await getDoc(doc(db, "notes", uid));
  const noteText = noteSnap.exists() ? noteSnap.data().text || "" : "";

  container.innerHTML = `
    <div class="smartspace">
      <div class="ss-weather" id="ssWeather">
        <span class="ss-icon">🌤️</span>
        <div class="ss-weather-text"><span id="ssCity">${cityName}</span><small>در حال دریافت…</small></div>
      </div>
      <div class="ss-divider"></div>
      <div class="ss-note">
        <span class="ss-icon">📝</span>
        <input id="ssNoteInput" class="ss-note-input" placeholder="یادداشت سریع…" value="${noteText.replace(/"/g, "&quot;")}">
      </div>
    </div>
  `;

  let noteTimer = null;
  document.getElementById("ssNoteInput").addEventListener("input", e => {
    clearTimeout(noteTimer);
    const text = e.target.value;
    noteTimer = setTimeout(() => {
      setDoc(doc(db, "notes", uid), { text, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
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
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, "users", uid), { weatherCity: cityName }, { merge: true });
}
