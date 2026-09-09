import fs from "node:fs";

const p = "android/app/src/main/AndroidManifest.xml";
if (!fs.existsSync(p)) {
  console.log("Android project not created yet; skip manifest patch");
  process.exit(0);
}

let s = fs.readFileSync(p, "utf8");

// OAuth returns to a custom URI. MainActivity must receive the URI even when
// Hoviyat is already running, so a second Activity instance is not created.
s = s.replace(
  /<activity([^>]*android:name="\.MainActivity"[^>]*)>/,
  (m, attrs) => attrs.includes("android:launchMode")
    ? m
    : `<activity${attrs} android:launchMode="singleTask">`
);

const filter = `            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="ir.hoviyat.app" android:host="auth" android:path="/oauth" />
            </intent-filter>`;

if (!s.includes('android:scheme="ir.hoviyat.app"')) {
  const activity = /(<activity[^>]*android:name="\.MainActivity"[^>]*>)/;
  if (!activity.test(s)) throw new Error("MainActivity declaration not found in AndroidManifest.xml");
  s = s.replace(activity, `$1\n${filter}`);
}

fs.writeFileSync(p, s);
console.log("Hoviyat Android OAuth deep link patched: ir.hoviyat.app://auth/oauth");
