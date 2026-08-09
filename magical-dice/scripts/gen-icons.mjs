// Renders the app icon + iOS splash from scripts/icon.html at every size the
// project needs (iOS asset catalog + PWA icons).
import path from 'node:path';
import { launch, ROOT } from './harness.mjs';

const SRC = 'file://' + path.join(ROOT, 'scripts/icon.html');
const { browser } = await launch({ width: 8, height: 8 });

async function render(w, h, out, hash = '') {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(SRC + hash);
  await page.waitForTimeout(700); // let the embedded fonts settle
  await page.screenshot({ path: path.join(ROOT, out) });
  await page.close();
  console.log('wrote', out);
}

await render(1024, 1024, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
await render(1024, 1024, 'public/icons/icon-1024.png');
await render(512, 512, 'public/icons/icon-512.png');
await render(180, 180, 'public/icons/apple-touch-icon.png');
await render(2732, 2732, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png', '#splash');
await render(2732, 2732, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png', '#splash');
await render(2732, 2732, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png', '#splash');
await browser.close();
