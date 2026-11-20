// Renders public/icons/icon.svg to the PNG sizes the manifest needs (run once after changing the icon).
//   CHROME_PATH=… node scripts/icons.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: new URL(`../public/icons/icon-${size}.png`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
console.log('icons written');
