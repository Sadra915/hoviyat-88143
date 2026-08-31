#!/usr/bin/env node
/**
 * build-dist.mjs
 * از یک کدبیس مشترک، دو پوشه‌ی جدا می‌سازد — هرکدام آماده برای بسته‌بندی
 * جداگانه با Capacitor:
 *   dist-app/    → اپ اصلی هویت (از index.html)
 *   dist-admin/  → پنل ادمین، به‌عنوان یک اپ کاملاً جدا (از admin.html)
 *
 * هیچ‌کدام bundler/minify ندارند — دقیقاً همان فایل‌های خام کپی می‌شوند،
 * چون خود پروژه از اول بدون build step نوشته شده (ES modules خام).
 *
 * اجرا: node build-dist.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const SHARED_DIRS = ["js", "css", "assets"];
const SHARED_FILES = ["service-worker.js"];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function buildTarget({ outDir, entryHtml, appName, shortName, startUrl }) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const dir of SHARED_DIRS) {
    if (fs.existsSync(path.join(root, dir))) copyDir(path.join(root, dir), path.join(outDir, dir));
  }
  for (const file of SHARED_FILES) {
    if (fs.existsSync(path.join(root, file))) fs.copyFileSync(path.join(root, file), path.join(outDir, file));
  }

  // فایل HTML ورودی همیشه باید اسمش index.html باشد چون Capacitor دنبال همین می‌گردد
  const html = fs.readFileSync(path.join(root, entryHtml), "utf8");
  fs.writeFileSync(path.join(outDir, "index.html"), html);

  // یک manifest.json مخصوص همین اپ (اسم/آیکون جدا از اپ اصلی، تا روی گوشی
  // با آیکون و اسم درست نصب شود و با اپ دیگر اشتباه گرفته نشود)
  const manifest = {
    name: appName,
    short_name: shortName,
    start_url: startUrl,
    display: "standalone",
    background_color: "#F3F1EE",
    theme_color: "#F0651E",
    icons: [
      { src: "assets/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "assets/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "assets/icons/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`ساخته شد: ${outDir}  (از ${entryHtml})`);
}

buildTarget({
  outDir: path.join(root, "dist-app"),
  entryHtml: "index.html",
  appName: "هویت",
  shortName: "هویت",
  startUrl: "index.html",
});

buildTarget({
  outDir: path.join(root, "dist-admin"),
  entryHtml: "admin.html",
  appName: "هویت — پنل ادمین",
  shortName: "هویت ادمین",
  startUrl: "index.html",
});

console.log("\nتمام. حالا:");
console.log("  npm run app:add-android     → ساخت پروژه‌ی اندروید برای اپ اصلی");
console.log("  npm run admin:add-android   → ساخت پروژه‌ی اندروید جدا برای پنل ادمین");
