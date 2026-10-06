#!/usr/bin/env node
// 지피터스 게시판에 이미 있는 태그를 찾는다. 토큰·로그인 불필요(공개 커뮤니티 게스트 토큰).
// 사용법: node find-tags.mjs "24기" "리모션" "Remotion"
// 출력: 검색어마다 일치하는 태그 목록. 없으면 "(없음)". 새 태그를 만들기 전에 같은 표기가 있는지 볼 때 쓴다.
const API = 'https://api.bettermode.com'
const NETWORK = 'www.gpters.org'
// 24기 모아보기에서 제외된 폐강 스터디 6개와 고아 태그 3개(2026-10-06 확인).
// 게시판의 태그 자체는 지우지 않는다. 스킬의 추천 목록에서만 제외한다.
const excludedStudyTags = new Set([
  '24기 K뷰티브랜드', '24기 끌림영상', '24기 무드앤코드',
  '24기 브랜드콘텐츠', '24기 영상파이프라인', '24기 음성AI비서',
  '24기', '24기게임메이커스', '24기 생활형',
])
const words = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (!words.length) { console.error('사용법: node find-tags.mjs "24기" "리모션" "Remotion"'); process.exit(1) }
async function gql(query, variables, token) {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ query, variables }) })
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.data
}
let t
try { t = await gql(`query{ tokens(networkDomain:"${NETWORK}"){ accessToken } }`) }
catch (e) { console.error(`게시판에 연결하지 못했어요(인터넷 또는 api.bettermode.com 문제): ${e.cause?.code || e.message}. 태그는 발행 화면의 입력창에서 직접 검색해 주세요.`); process.exit(3) }
const token = t.tokens.accessToken
for (const q of words) {
  let d
  try { d = await gql(`query($q:String!){ tags(limit:30, query:$q){ nodes { title slug } } }`, { q }, token) }
  catch (e) { console.error(`태그 검색이 안 됐어요(${e.cause?.code || e.message}). 태그는 발행 화면의 입력창에서 직접 검색해 주세요.`); process.exit(3) }
  // 문장처럼 긴 태그(멤버가 잘못 만든 것)는 뺀다. 검색어와 같은 표기가 있으면 맨 앞에.
  const names = d.tags.nodes.map(x => x.title.trim()).filter(n => n.length <= 30 && !/[.。!?]/.test(n) && !excludedStudyTags.has(n))
  const lower = q.toLowerCase()
  names.sort((a, b) => (b.toLowerCase() === lower) - (a.toLowerCase() === lower) || a.localeCompare(b, 'ko'))
  console.log(`${q}: ${names.length ? names.slice(0, 30).map((n, i) => `${i + 1}. ${n}`).join('  ') : '(없음)'}`)
}
