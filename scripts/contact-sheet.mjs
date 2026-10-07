// Contact sheets: renders a list of scene views in a real browser and assembles them into one labelled PNG per category,
// for a human to look at. No dependencies beyond Playwright: the sheet is an HTML grid that the same browser screenshots.
//
//   node scripts/contact-sheet.mjs --url http://127.0.0.1:4320 --out evidence/contact-sheets
//        [--token-file .data/e2e-session.json | --token <owner token>] [--category scene|life|squad|all]
//        [--effects id,id@t1/t2/t3] [--times 0,1000,2000] [--sheet <file name>] [--theme dark|light] [--quality low|balanced|high] [--size 1280x800] [--dpr 2] [--crop 0.5] [--gpu]
//
// `scene` shots the existing scene (default view plus the opt-in previews). `life` shots every `--effects` id at each
// `--times` through `?preview=life&effect=<id>&t=<ms>`; with no effects registered it renders nothing and says so.
// `--gpu` launches Chrome on the real GPU (ANGLE Metal) instead of the default software path; the renderer is printed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const SCENE_SHOTS = [
  { id: 'overview', query: '' },
  { id: 'intensity-3', query: 'intensity=3' },
  { id: 'compact', query: 'compact=1' },
  { id: 'talk', query: 'talk=1' },
];
// The squad storyboard (docs/design/office-life.md section 2.4, frames 1 to 8) on stand-in subagents (`?squad=`):
// `settle` is how long after the scene is up the frame is taken, so a frame is where the preview's clock puts it.
const SQUAD_SHOTS = [
  { id: 'zone-seated', query: 'squad=4&look=1', settle: 5000 },
  { id: 'spawn', query: 'squad=2&arrive=5000&look=1', settle: 5300 },
  { id: 'arrival', query: 'squad=2&arrive=5000&look=1', settle: 6300 },
  { id: 'gather', query: 'squad=6&arrive=1500&look=1', settle: 10500 },
  { id: 'dismiss-wave', query: 'squad=2&leave=4000&look=1', settle: 5200 },
  { id: 'dismiss-walk', query: 'squad=2&leave=4000&look=1', settle: 9000 },
  // Frames 4 to 7 (puppet strings and the hand-over of a result), up close. `look=desk` frames the supervisor's desk.
  { id: 'strings-taut', query: 'squad=4&tools=900&look=1', settle: 5000 },
  { id: 'strings-slack', query: 'squad=2&leave=4000&look=1', settle: 3600 },
  { id: 'handover-stand', query: 'squad=1&leave=4000&tools=900&look=desk', settle: 3200 },
  { id: 'handover-walk', query: 'squad=1&leave=4000&tools=900&look=desk', settle: 4800 },
  { id: 'handover-present', query: 'squad=1&leave=4000&tools=900&look=desk', settle: 6200 },
  { id: 'handover-stamp', query: 'squad=1&leave=4000&tools=900&look=desk', settle: 8000 },
  { id: 'handover-received', query: 'squad=1&leave=4000&tools=900&look=desk', settle: 9500 },
  {
    id: 'handover-returned',
    query: 'squad=1&leave=4000&tools=900&look=desk&result=error',
    settle: 9500,
  },
];
const SETTLE_MS = 3500;
const COLUMNS = 3;

const flags = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    out[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? true : next;
  }
  return out;
};

const readToken = (args) => {
  if (typeof args.token === 'string') return args.token;
  const file =
    typeof args['token-file'] === 'string' ? args['token-file'] : '.data/e2e-session.json';
  const raw = readFileSync(file, 'utf8').trim();
  if (!file.endsWith('.json')) return raw;
  return readFileSync(join(JSON.parse(raw).directory, 'owner-token'), 'utf8').trim();
};

/** The shots of a category: `{ id, query }` where `query` is appended to the office URL. */
export function shotsFor(category, args) {
  if (category === 'scene') return SCENE_SHOTS;
  if (category === 'squad') return SQUAD_SHOTS;
  const effects = typeof args.effects === 'string' ? args.effects.split(',').filter(Boolean) : [];
  const defaults = (typeof args.times === 'string' ? args.times : '0,1000,2000')
    .split(',')
    .map((t) => Number(t));
  // `id` takes the default times; `id@3000/8000/14000` brings its own (effects last from 2 s to 45 s).
  return effects.flatMap((spec) => {
    const [effect, own] = spec.split('@');
    const times = own ? own.split('/').map((t) => Number(t)) : defaults;
    return times.map((t) => ({
      id: `${effect}-${t}`,
      query: `preview=life&effect=${effect}&t=${t}`,
    }));
  });
}

const escape = (text) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function sheetHtml(category, shots, width) {
  const cells = shots
    .map(
      (s) =>
        `<figure><img src="data:image/png;base64,${s.png.toString('base64')}"><figcaption>${escape(s.id)}</figcaption></figure>`,
    )
    .join('');
  return `<!doctype html><meta charset="utf-8"><title>${escape(category)}</title>
<style>body{margin:0;padding:12px;background:#111;color:#ddd;font:13px/1.4 system-ui}
h1{font-size:14px;margin:0 0 8px}.g{display:grid;grid-template-columns:repeat(${COLUMNS},${width}px);gap:10px}
figure{margin:0}img{display:block;width:${width}px;border:1px solid #333}figcaption{padding:2px 0}</style>
<h1>${escape(category)}</h1><div class="g">${cells}</div>`;
}

async function enter(page, url, token, theme, quality) {
  await page.addInitScript(
    ({ value, quality }) => {
      window.localStorage.setItem('aether-building-panel', 'closed'); // the decks panel would cover the scene
      window.localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: {
            theme: value,
            locale: 'en',
            view: '3d',
            autoCamera: false,
            advanced: true,
            panelCollapsed: true, // the scene gets the room
            ...(quality ? { quality } : {}),
          },
          version: 0,
        }),
      );
    },
    { value: theme, quality },
  );
  await page.goto(url);
  await page.getByLabel(/access token|存取權杖/i).fill(token);
  await page.getByRole('button', { name: /enter office|進入辦公室/i }).click();
  await page.locator('canvas').first().waitFor({ timeout: 30000 });
}

async function main() {
  const args = flags(process.argv.slice(2));
  const base = typeof args.url === 'string' ? args.url : 'http://127.0.0.1:4320';
  const out = typeof args.out === 'string' ? args.out : 'evidence/contact-sheets';
  const theme = args.theme === 'light' ? 'light' : 'dark';
  const quality = ['low', 'balanced', 'high'].includes(args.quality) ? args.quality : undefined;
  const dpr = typeof args.dpr === 'string' ? Number(args.dpr) : 1;
  const sheet = typeof args.sheet === 'string' ? args.sheet : null;
  const crop = typeof args.crop === 'string' ? Number(args.crop) : null;
  const [w, h] = (typeof args.size === 'string' ? args.size : '1280x800').split('x').map(Number);
  const wanted = ['life', 'scene', 'squad'].includes(args.category)
    ? [args.category]
    : ['scene', 'life', 'squad'];
  mkdirSync(out, { recursive: true });
  const token = readToken(args);
  const browser = await chromium.launch({
    channel: 'chrome',
    args: args.gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [],
  });
  try {
    for (const category of wanted) {
      const list = shotsFor(category, args);
      if (!list.length) {
        console.log(`${category}: no effects registered, nothing rendered (not a pass)`);
        continue;
      }
      const taken = [];
      for (const shot of list) {
        const context = await browser.newContext({
          viewport: { width: w, height: h },
          deviceScaleFactor: dpr,
        });
        const page = await context.newPage();
        await enter(page, `${base}/${shot.query ? `?${shot.query}` : ''}`, token, theme, quality);
        await page.waitForTimeout(shot.settle ?? SETTLE_MS);
        // Just the scene (its overlays included), not the app around it.
        const box = await page.locator('canvas').first().boundingBox();
        // The camera looks at the member of a life preview, so its middle is where a small effect is: crop to it.
        const keep = crop ?? (category === 'life' ? 0.5 : 1);
        const clip = box && {
          x: box.x + (box.width * (1 - keep)) / 2,
          y: box.y + (box.height * (1 - keep)) / 2,
          width: box.width * keep,
          height: box.height * keep,
        };
        const png = await page.screenshot(clip ? { clip } : {});
        writeFileSync(join(out, `${category}-${shot.id}.png`), png);
        taken.push({ id: shot.id, png });
        await context.close();
      }
      const sheetWidth = Math.round(w / 2.5);
      const context = await browser.newContext({
        viewport: { width: COLUMNS * (sheetWidth + 10) + 24, height: 600 },
      });
      const page = await context.newPage();
      await page.setContent(sheetHtml(sheet ?? category, taken, sheetWidth));
      await page.screenshot({ path: join(out, `${sheet ?? category}-sheet.png`), fullPage: true });
      await context.close();
      console.log(
        `${category}: ${taken.length} shots -> ${join(out, `${sheet ?? category}-sheet.png`)}`,
      );
    }
    const probe = await browser.newPage();
    const renderer = await probe.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    console.log(`renderer: ${renderer}`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
