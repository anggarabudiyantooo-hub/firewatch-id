'use strict';

// Tangkapan layar dashboard untuk verifikasi visual.
// Pakai: node scripts/screenshot-dashboard.js --out docs/screenshots/dashboard-clean-ui --label before

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outDir = path.resolve(arg('--out', 'docs/screenshots/dashboard-clean-ui'));
const label = arg('--label', 'dashboard');
const baseUrl = arg('--url', 'http://127.0.0.1:3000');
const views = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 }
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const view of views) {
      const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
      page.setDefaultTimeout(20000);
      await page.goto(baseUrl + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#map', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(7000);
      const file = path.join(outDir, `${label}-${view.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(file);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
