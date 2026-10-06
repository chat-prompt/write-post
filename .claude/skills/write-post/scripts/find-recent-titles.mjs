#!/usr/bin/env node
// 지피터스 게시판에 최근 올라온 글 제목을 가져와 이번 글 제목과 겹치는지 본다. 토큰·로그인 불필요(공개 게스트 토큰).
// 사용법: node find-recent-titles.mjs "클로드 코드" "n8n" [--days 14] [--limit 300]
// 출력: 검색어(도구명)가 제목에 든 최근 글 목록(날짜·제목·주소). 없으면 "(없음)".
//   구글 site: 검색은 방금 올라온 글을 못 잡는다. 스터디 기간엔 한 주 수백 편이 올라오니 이걸 먼저 본다.
// 종료 코드: 0 정상, 3 연결 실패(그럴 땐 site: 검색만으로 간다)
const API = 'https://api.bettermode.com'
const NETWORK = 'www.gpters.org'
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const days = Number(opt('--days', 14)), limit = Number(opt('--limit', 300))
const words = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--days' && args[i - 1] !== '--limit')
if (!words.length) { console.error('사용법: node find-recent-titles.mjs "클로드 코드" "n8n" [--days 14]'); process.exit(1) }
async function gql(query, variables, token) {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ query, variables }) })
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.data
}
let token
try { token = (await gql(`query{ tokens(networkDomain:"${NETWORK}"){ accessToken } }`)).tokens.accessToken }
catch (e) { console.error(`게시판에 연결하지 못했어요(${e.cause?.code || e.message}). 최근 글 대조는 건너뛰고 site: 검색만으로 가세요.`); process.exit(3) }
const since = Date.now() - days * 86400e3
const posts = []
let after = null
try {
  while (posts.length < limit) {
    const d = await gql(`query($limit:Int!,$after:String){ posts(limit:$limit, after:$after, orderBy:publishedAt, reverse:true){ pageInfo{ hasNextPage endCursor } nodes { title publishedAt url space { slug } } } }`, { limit: 50, after }, token)
    const nodes = d.posts.nodes.filter(p => p.title)
    posts.push(...nodes)
    const oldest = nodes.at(-1)
    if (!d.posts.pageInfo.hasNextPage || (oldest && Date.parse(oldest.publishedAt) < since)) break
    after = d.posts.pageInfo.endCursor
  }
} catch (e) { console.error(`최근 글을 못 가져왔어요(${e.cause?.code || e.message}). site: 검색만으로 가세요.`); process.exit(3) }
const recent = posts.filter(p => Date.parse(p.publishedAt) >= since)
const norm = s => s.toLowerCase().replace(/\s+/g, '')
console.log(`최근 ${days}일 글 ${recent.length}편 중에서 찾았어요.`)
for (const w of words) {
  const hits = recent.filter(p => norm(p.title).includes(norm(w)))
  console.log(`\n${w}: ${hits.length ? '' : '(없음)'}`)
  for (const p of hits.slice(0, 40)) console.log(`- ${p.publishedAt.slice(0, 10)} ${p.title}  ${p.url}`)
}
const both = words.length > 1 ? recent.filter(p => words.every(w => norm(p.title).includes(norm(w)))) : []
if (words.length > 1) console.log(`\n도구 조합 ${words.join(' + ')} 둘 다 든 제목: ${both.length ? both.map(p => p.title).join(' / ') : '(없음)'}`)
