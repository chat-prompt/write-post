#!/usr/bin/env node
// 초안(.md)을 폰 폭(390px)으로 렌더해 PNG로 찍는다. 문단·섹션 간격을 눈으로 보는 용도.
// 사용법: node preview-mobile.mjs 초안.md [--out preview-mobile.png] [--width 390]
// 마크다운 변환은 CDN의 marked를 쓴다(네트워크 필요). 이미지는 상대 경로면 초안 폴더 기준으로 보여준다.
import path from "node:path";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
let chromium;
async function loadPlaywright() {
  const tries = [() => import("playwright")];
  try { const { execSync } = await import("node:child_process"); const root = execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); tries.push(() => import(`${root}/playwright/index.mjs`)); } catch {}
  const home = process.env.HOME || "";
  for (const p of ["/opt/homebrew/lib/node_modules/playwright/index.mjs", `${home}/.claude/skills/write-post/node_modules/playwright/index.mjs`]) tries.push(() => import(p));
  for (const t of tries) { try { return (await t()).chromium; } catch {} }
  console.error("playwright가 없어요. 한 번만 설치하세요: npm i -g playwright && npx playwright install chromium"); process.exit(3);
}
chromium = await loadPlaywright();

const args = process.argv.slice(2);
const src = args.find(a => a.endsWith(".md"));
const get = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
if (!src) { console.error("사용법: node preview-mobile.mjs 초안.md [--out preview-mobile.png] [--width 390]"); process.exit(1); }
const width = Number(get("--width") || 390);
const out = path.resolve(get("--out") || src.replace(/\.md$/, `-preview-${width}.png`));
let md = readFileSync(src, "utf-8");
if (md.startsWith("---")) md = md.split("---", 3).slice(2).join("---");
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
 body{margin:0;background:#fff;color:#1f2937;font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;}
 .post{padding:20px 16px;font-size:16px;line-height:1.75;}
 h1{font-size:24px;line-height:1.35;margin:0 0 20px;} h2{font-size:20px;margin:36px 0 12px;} h3{font-size:17px;margin:24px 0 8px;}
 p{margin:0 0 16px;} ul,ol{padding-left:22px;margin:0 0 16px;} li{margin:4px 0;}
 img{max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0 4px;}
 figure{margin:16px 0;} figcaption{font-size:13px;color:#6b7280;}
 pre{background:#f3f4f6;padding:12px;border-radius:8px;overflow:auto;font-size:13px;} code{font-size:14px;}
 blockquote{border-left:3px solid #e5e7eb;margin:0 0 16px;padding:4px 12px;color:#4b5563;}
 table{border-collapse:collapse;} td,th{padding:0 4px;} /* 베터모드처럼 표 여백 없음 */
</style></head><body><div class="post" id="post"></div>
<script>document.getElementById('post').innerHTML = marked.parse(${JSON.stringify(md)});</script></body></html>`;
const tmp = path.join(path.dirname(path.resolve(src)), `.preview-${width}.html`);
writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
await page.goto(`file://${tmp}`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const h = await page.evaluate(() => document.body.scrollHeight);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
try { unlinkSync(tmp); } catch {}
console.log(`saved ${out} (${width}px 폭, 전체 높이 ${h}px, 폰 화면 약 ${Math.ceil(h / 760)}장 분량)`);
