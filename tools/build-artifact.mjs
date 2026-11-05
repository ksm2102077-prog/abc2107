// index.html と CSS/JS を 1 つの HTML にまとめる（claude.ai の Artifact で開く用）。
// Artifact では Service Worker・マニフェストが使えないので、それらは外す。
// 使い方: node tools/build-artifact.mjs [出力先]   既定: dist/artifact.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'artifact.html'));
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// スタンドアロン専用の部分を外す
html = html.replace(/<!-- BUILD:STANDALONE-ONLY -->[\s\S]*?<!-- \/BUILD:STANDALONE-ONLY -->\s*/g, '');
// CSS と JS を埋め込む（</script> などが本文中に現れないことを確認）
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  const css = fs.readFileSync(path.join(ROOT, href), 'utf8');
  return `<style>\n${css}\n</style>`;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(ROOT, src), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(`${src} に </script が含まれています`);
  return `<script>\n${js}\n</script>`;
});
// 外部ファイル参照（マニフェスト・アイコン）と、Artifact 側が用意する枠を外す
html = html
  .replace(/<link rel="(manifest|apple-touch-icon|icon)"[^>]*>\s*/g, '')
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(1) + ' KB');
