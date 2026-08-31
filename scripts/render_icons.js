import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  const svgPath = path.resolve('apps/desktop/static/logo.svg');
  const svg = fs.readFileSync(svgPath, 'utf8');

  await page.setContent(`<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;width:512px;height:512px;}svg{width:100%;height:100%;display:block;}</style></head><body>${svg}</body></html>`);

  const buffer512 = await page.screenshot({ omitBackground: true });
  fs.writeFileSync('temp_logo_512.png', buffer512);
  console.log('512x512 PNG generated.');
  await browser.close();
})();
