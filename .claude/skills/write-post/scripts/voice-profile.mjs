#!/usr/bin/env node
// 멤버 공개 글에서 숫자만 재서 짧은 문체 파일을 만든다. 글을 흉내 내지 않는다(어미 비율·문장 길이·느낌표·괄호만).
// 사용법: node voice-profile.mjs ./my-posts.json --out ~/.gpters/write-post/voice.md [--min 3]
// 종료 코드: 0 만듦 · 3 글이 3편 미만(기본 문체로) · 2 입력 오류
import fs from 'node:fs'
import path from 'node:path'
const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const get = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
const out = get('--out'); const MIN = Number(get('--min') || 3)
if (!file || !fs.existsSync(file)) { console.error('사용법: node voice-profile.mjs ./my-posts.json --out voice.md'); process.exit(2) }
const data = JSON.parse(fs.readFileSync(file, 'utf8'))
const all = data.posts || []
// 이 스킬이 써 준 글은 뺀다(흔적 2개 이상): ▲ 캡션, "지피터스 … 멤버 …예요", "이렇게 시키면 돼요", "아직 안 된 것"
const skillMade = t => ['▲ ', '이렇게 시키면 돼요', '아직 안 된 것'].filter(m => t.includes(m)).length + (/지피터스 [^\n]{0,40}멤버 [^\n]{0,30}(예요|이에요)/.test(t) ? 1 : 0) >= 2
const posts = all.filter(p => (p.text || '').length >= 300 && !skillMade(p.text))
if (posts.length < MIN) { console.log(`공개 글이 ${posts.length}편이라 기본 문체로 가요(스킬이 쓴 글 ${all.length - posts.length}편 제외).`); process.exit(3) }

const strip = t => t.replace(/https?:\/\/\S+/g, '').replace(/```[\s\S]*?```/g, '').replace(/^\s*[>#▲].*$/gm, '')
const classes = { eo: 0, nida: 0, da: 0, other: 0 }
let sents = 0, chars = 0, shortN = 0, longN = 0, bang = 0, paren = 0, emoji = 0, lens = []
for (const p of posts) {
  const t = strip(p.text)
  chars += t.replace(/\s/g, '').length
  bang += (t.match(/!/g) || []).length
  paren += (t.match(/\([^)]{4,40}(요|다|죠|ㅋ|ㅎ)\)/g) || []).length
  emoji += (t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length
  for (let s of t.split(/(?<=[.!?])\s+|\n+/)) {
    s = s.trim(); if (s.length < 6) continue
    sents++; lens.push(s.length); if (s.length < 20) shortN++; if (s.length > 60) longN++
    const e = s.replace(/[.!?"”')\]\s]+$/, '')
    if (/(어요|아요|해요|예요|에요|죠|네요|거든요|잖아요|을까요|ㄹ게요|게요)$/.test(e)) classes.eo++
    else if (/(습니다|입니다|니다|ㅂ니다|십시오|니까)$/.test(e)) classes.nida++
    else if (/(다|음|함|됨|임|것|기|함)$/.test(e)) classes.da++
    else classes.other++
  }
}
if (sents < 30) { console.log(`문장이 ${sents}개뿐이라 기본 문체로 가요.`); process.exit(3) }
const pct = n => Math.round(n / sents * 100)
const names = { eo: '~어요', nida: '~습니다', da: '~다' }
const ranked = Object.entries(classes).filter(([k]) => k !== 'other').sort((a, b) => b[1] - a[1])
const [m1, m2] = ranked; const p1 = pct(m1[1]), p2 = pct(m2[1])
const perPost = n => (n / posts.length).toFixed(1)
const avg = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)
const today = new Date().toISOString().slice(0, 10)

let endingLine
if (p2 === 0 || p1 >= p2 * 3) endingLine = `${names[m1[0]]}체가 주력(${p1}%). ${names[m2[0]]}는 가끔만(${p2}%).`
else if (p1 >= p2 * 1.5) endingLine = `${names[m1[0]]}체가 주력(${p1}%), ${names[m2[0]]}를 보조로 섞음(${p2}%).`
else endingLine = `${names[m1[0]]}(${p1}%)와 ${names[m2[0]]}(${p2}%)를 비슷하게 섞음.`
const bangLine = bang / posts.length < 1 ? '느낌표는 거의 안 씀(한 편에 0~1개).' : `느낌표는 한 편에 ${perPost(bang)}개쯤.`
const parenLine = paren / posts.length < 0.5 ? '괄호 혼잣말은 거의 안 씀.' : `괄호 혼잣말은 한 편에 ${perPost(paren)}개쯤. 기록에 실제로 있는 말만 넣는다.`
const emojiLine = '이모지는 게시글에 넣지 않는다.'

const md = `# 내 문체 (자동, ${today}, 공개 글 ${posts.length}편 ${sents}문장 기준)

제 공개 글에서 숫자만 재서 만든 파일이에요. 아래 두 절만 옮기고, 말버릇·오타·유행어·이모지는 흉내 내지 않아요. 글마다 똑같이 들리지 않게 한 문단 안에서 어미를 섞어요.

## 종결어미
- ${endingLine}
- 같은 어미가 네 문장 넘게 이어지지 않게 한다. 사실 서술은 주력 어미로, 느낀 점이나 되돌아보는 문장은 보조 어미로.

## 문장
- 한 문장 평균 ${avg}자. 20자 미만 짧은 문장 ${pct(shortN)}%, 60자 넘는 긴 문장 ${pct(longN)}%. 이 비율대로 짧고 긴 문장을 섞는다.
- ${bangLine} ${parenLine} ${emojiLine}

## 그대로 두는 것 (지피터스 공통)
- 줄표(—, –) 금지, 범위는 말로("2주에서 4주"). 첫째·둘째·셋째 금지. "박습니다" 계열 금지.
- 헤지("~인 것 같습니다", "~일 수도") 금지. 격언으로 맺지 않는다. 3인칭·AI 시점("사용자가 물었다") 금지. 1인칭은 "제가", "저".
- AI에게 친 말은 오타까지 원문 그대로. 막힌 순간의 감정 한 줄은 기록에 있는 내 말로만. 모르는 건 모른다고, 안 된 건 안 됐다고.
- 추상 형용사("최고의", "놀라운") 금지. 비유는 한 편에 하나. 낯선 용어는 처음 나올 때 한 줄로 푼다.
`
if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, md) }
console.log(`문체 파일을 만들었어요: 공개 글 ${posts.length}편(스킬이 쓴 글 ${all.length - posts.length}편 제외) · ${endingLine} 평균 ${avg}자`)
if (!out) process.stdout.write('\n' + md)
