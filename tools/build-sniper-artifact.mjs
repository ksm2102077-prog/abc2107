// sniper/ のゲームを 1 つの HTML にまとめる（claude.ai の Artifact で開く用）。
// three.js は CDN から読み込むのでそのまま残す。
// 使い方: node tools/build-sniper-artifact.mjs [出力先]   既定: dist/sniper.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sniper');
const out = path.resolve(process.argv[2] || path.join(ROOT, '..', 'dist', 'sniper.html'));
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) => `<style>\n${fs.readFileSync(path.join(ROOT, href), 'utf8')}\n</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(ROOT, src), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(`${src} に </script が含まれています`);
  return `<script>\n${js}\n</script>`;
});
// Artifact 側が用意する枠を外す
html = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<meta name="(theme-color|apple-mobile-web-app-capable)"[^>]*>\s*/g, '');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(1) + ' KB');
