#!/usr/bin/env node
// 링크를 열어 화면을 찍는다(공개 페이지용). 로그인이 필요한 페이지(슬랙·노션 비공개 등)는 못 찍는다.
//   node capture-url.mjs https://example.com --out ./case-post-images/result.png [--width 1280] [--full]
// playwright가 있어야 한다. 없으면 종료 코드 3(그때는 클로드 코드의 브라우저 도구를 쓰거나 멤버에게 캡처를 부탁한다).
import path from 'node:path'
import { mkdirSync } from 'node:fs'
async function loadPlaywright() {
  const tries = [() => import('playwright')]
  try { const { execSync } = await import('node:child_process'); const root = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); tries.push(() => import(`${root}/playwright/index.mjs`)) } catch {}
  const home = process.env.HOME || process.env.USERPROFILE || ''
  for (const p of ['/opt/homebrew/lib/node_modules/playwright/index.mjs', `${home}/.claude/skills/write-post/node_modules/playwright/index.mjs`]) tries.push(() => import(p))
  for (const t of tries) { try { return (await t()).chromium } catch {} }
  return null
}
const args = process.argv.slice(2)
const url = args.find(a => /^https?:\/\//.test(a))
const get = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
if (!url) { console.error('쓰는 법: node capture-url.mjs https://주소 --out 파일.png'); process.exit(1) }
const out = path.resolve(get('--out') || './case-post-images/capture.png')
const width = Number(get('--width') || 1280)
const chromium = await loadPlaywright()
if (!chromium) { console.error('playwright가 없어서 링크를 못 찍어요. 브라우저 도구가 있으면 그걸 쓰고, 없으면 멤버에게 캡처를 부탁하세요.'); process.exit(3) }
mkdirSync(path.dirname(out), { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 2 })
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  if (!res || res.status() >= 400) { console.error(`페이지를 못 열었어요 (${res ? res.status() : '응답 없음'}). 로그인이 필요한 곳이면 멤버가 직접 찍어야 해요.`); process.exit(2) }
  const t = (await page.title()) || ''
  if (/log ?in|sign ?in|로그인/i.test(t + ' ' + page.url())) { console.error('로그인 화면이 떠요. 이 링크는 멤버가 직접 찍어야 해요.'); process.exit(2) }
  await page.screenshot({ path: out, fullPage: args.includes('--full') })
  console.log(`찍었어요: ${out} (${t.slice(0, 60)})`)
} finally { await browser.close() }
