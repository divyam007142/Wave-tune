import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicFile = (url: string) => resolve(projectRoot, "public", url.replace(/^\/+/, ""));

test("PWA manifest icons exist and match their declared PNG dimensions", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(projectRoot, "public/manifest.webmanifest"), "utf8"),
  ) as { icons?: { src: string; sizes: string }[] };

  assert.ok(manifest.icons?.length, "manifest should declare at least one install icon");
  for (const icon of manifest.icons) {
    const path = publicFile(icon.src);
    assert.ok(existsSync(path), `manifest icon is missing: ${icon.src}`);
    const png = readFileSync(path);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${icon.src} should be a PNG`);
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

test("service-worker precache contains only existing public assets", () => {
  const source = readFileSync(resolve(projectRoot, "public/notification-sw.js"), "utf8");
  const match = source.match(/const APP_STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/);

  assert.ok(match, "service worker should define its static asset precache");
  const assets = [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
  assert.ok(assets.length > 0, "service worker should precache the app shell");

  for (const asset of assets) {
    assert.ok(existsSync(publicFile(asset)), `pre-cached public asset is missing: ${asset}`);
  }
});

test("initial splash and install guide reference available Wave Tune artwork", () => {
  const html = readFileSync(resolve(projectRoot, "index.html"), "utf8");
  const initialLogo = html.match(/class="initial-splash-mark"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
  assert.ok(initialLogo, "the initial loading splash should show the Wave Tune mark");
  assert.ok(existsSync(publicFile(initialLogo[1])), `initial splash image is missing: ${initialLogo[1]}`);

  const guide = readFileSync(resolve(projectRoot, "src/components/InstallAppButton.tsx"), "utf8");
  const guideLogo = guide.match(/src="(\/wave-tune-icon-192\.png)"/);
  assert.ok(guideLogo, "the install guide should show the Wave Tune app icon");
  assert.ok(existsSync(publicFile(guideLogo[1])), `install guide image is missing: ${guideLogo[1]}`);
});
