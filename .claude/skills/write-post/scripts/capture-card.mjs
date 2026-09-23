// 카드 캡처: .stage 요소만 타이트 캡처 (양옆 여백 자동 제거 + 균등 패딩)
// 사용: node <skill>/scripts/capture-card.mjs <card.html> [card2.html ...]
//   - 인자 경로는 cwd 기준(절대/상대 모두 OK). HTML이 <link href="_diagram.css"> 상대참조하면
//     같은 폴더에 _diagram.css가 있어야 함.
//   - 출력: 입력과 같은 폴더에 {name}.png (Retina @2x)
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
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
if (!args.length) {
  console.error("사용: node capture-card.mjs <card.html> [card2.html ...]");
  process.exit(1);
}
const PAD = Number(process.env.PAD || 56); // 콘텐츠 둘레 균등 여백(px)
const browser = await chromium.launch();
for (const a of args) {
  const abs = path.resolve(process.cwd(), a);
  if (!existsSync(abs)) { console.error("⚠️ 없음:", abs); continue; }
  const page = await browser.newPage({ viewport: { width: 1800, height: 700 }, deviceScaleFactor: 2 });
  await page.goto(`file://${abs}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const el = await page.$(".stage");
  if (!el) { console.error("⚠️ .stage 없음:", a, "— 카드 HTML에 <div class=\"stage\"> 필수"); await page.close(); continue; }
  let box = await el.boundingBox();
  // 뷰포트가 콘텐츠보다 작으면 clip이 잘린다. 뷰포트를 콘텐츠에 맞춰 늘리고 좌표를 다시 잰다.
  const needW = Math.ceil(box.width + PAD * 2);
  const needH = Math.ceil(box.height + PAD * 2);
  const vp = page.viewportSize();
  if (needW > vp.width || needH > vp.height) {
    // +64: body 여백·.stage 오프셋 때문에 딱 맞게 잡으면 끝이 몇 px 잘린다
    await page.setViewportSize({ width: Math.max(vp.width, needW + 64), height: Math.max(vp.height, needH + 64) });
    await page.waitForTimeout(120);
    box = await el.boundingBox();
  }
  const out = abs.replace(/\.html$/, ".png");
  const clip = {
    x: Math.max(0, box.x - PAD),
    y: Math.max(0, box.y - PAD),
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
  };
  await page.screenshot({ path: out, type: "png", clip });
  // 보고값이 아니라 저장된 PNG 헤더를 읽어 실제 크기를 알린다(조용한 잘림 방지)
  const buf = readFileSync(out);
  const realW = buf.readUInt32BE(16), realH = buf.readUInt32BE(20);
  // 소수점 반올림으로 1px은 흔히 어긋난다. 2px 이상 모자랄 때만 잘림으로 본다.
  const shortH = clip.height - realH / 2;
  const clipped = (clip.width - realW / 2) > 1.5 || shortH > 1.5;
  console.log("✓", path.basename(out), `(${realW / 2}×${realH / 2} CSS·실제 ×2)`,
    clipped ? `🔴 잘림! 요청 ${Math.round(clip.width)}×${Math.round(clip.height)} — ${Math.round(shortH)}px 부족` : "");
  await page.close();
}
await browser.close();
