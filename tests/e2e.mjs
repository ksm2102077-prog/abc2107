// ブラウザでの通しテスト（iPhone 15 Pro Max の画面サイズで実行）
// 実行: node tests/e2e.mjs   （Playwright と Chromium が必要）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro Max'], viewport: { width: 430, height: 839 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(base);
  await page.waitForFunction(() => window.__rg && window.__rg.rt.cssW > 0);
  const box = await page.locator('#board').boundingBox();
  check('盤面が画面幅いっぱい・縦横比どおり', Math.abs(box.width - 430) < 1 && Math.abs(box.height / box.width - 1.254) < 0.01, `${box.width}x${box.height}`);
  const t0 = await page.evaluate(() => window.__rg.computeTrace());
  check('サンプル盤面で10回反射を描く', t0.bounces.length === 10);

  // 引っ張って狙う（下へ引く → 上へ打つ）
  await page.mouse.move(box.x + 200, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 420, { steps: 6 });
  await page.mouse.up();
  const a1 = await page.evaluate(() => window.__rg.state.angle);
  check('真下へ引くと真上（0°）を向く', Math.abs(((a1 + 180) % 360) - 180) < 0.01, a1.toFixed(2));

  await page.locator('.fine[data-step="0.1"]').click();
  const a2 = await page.evaluate(() => window.__rg.state.angle);
  check('+0.1° ボタン', Math.abs(a2 - 0.1) < 1e-6, a2.toFixed(3));

  // スクショを読み込む
  await page.setInputFiles('#fileInput', path.join(ROOT, 'tests/fixtures/synthetic-1290x2796.png'));
  await page.waitForFunction(() => window.__rg.state.image && document.querySelector('#busy').hidden, null, { timeout: 15000 });
  const st = await page.evaluate(() => ({ calib: window.__rg.state.image.calib, cands: window.__rg.rt.candidates }));
  check('パネル上端を自動検出（1900行目）', Math.abs(st.calib.panelTop - 1900) <= 1, String(st.calib.panelTop));
  check('キャラ4体を検出', st.cands.length === 4, String(st.cands.length));
  const expect = [0.2, 0.4, 0.6, 0.8];
  check('キャラの位置（横）', st.cands.every((c, i) => Math.abs(c.x - expect[i]) < 0.01), st.cands.map((c) => c.x.toFixed(3)).join(','));
  check('キャラの位置（縦）', st.cands.every((c, i) => Math.abs(c.y - (i % 2 === 0 ? 0.95 : 1.0)) < 0.012), st.cands.map((c) => c.y.toFixed(3)).join(','));

  await page.locator('.cand-btn[data-cand="1"]').click();
  const st2 = await page.evaluate(() => ({ ball: window.__rg.state.ball, allies: window.__rg.state.allies.length }));
  check('候補をタップすると自キャラと味方3体が置かれる', Math.abs(st2.ball.x - 0.4) < 0.01 && st2.allies === 3);

  // 敵を足して大きさを変える
  await page.locator('#addEnemy').click();
  await page.locator('.chip-opt[data-preset="0.12"]').click();
  const en = await page.evaluate(() => window.__rg.state.enemies.slice(-1)[0]);
  check('敵を追加して「大」にする', en && Math.abs(en.r - 0.12) < 1e-9);

  // 保存 → 再読み込みで復元
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(() => window.__rg && window.__rg.rt.img);
  const st3 = await page.evaluate(() => ({ ball: window.__rg.state.ball, enemies: window.__rg.state.enemies.length, img: !!window.__rg.rt.img }));
  check('再起動しても配置とスクショが残る', st3.img && st3.enemies >= 1 && Math.abs(st3.ball.x - 0.4) < 0.01);

  check('エラーが出ていない', errors.length === 0, errors.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); }
console.log('\nすべて成功');
