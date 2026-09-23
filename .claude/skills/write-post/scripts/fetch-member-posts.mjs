#!/usr/bin/env node
// 지피터스 닉네임으로 그 사람의 공개 글을 가져온다. 토큰·로그인 불필요(공개 커뮤니티 게스트 토큰).
// 사용법: node fetch-member-posts.mjs "<닉네임>" [--limit 30] [--out posts.json]
// 출력: { member:{id,name,tagline}, posts:[{id,title,url,createdAt,tags,text}] }
const API = 'https://api.bettermode.com'
const NETWORK = 'www.gpters.org'
const args = process.argv.slice(2)
const nick = args.find(a => !a.startsWith('--'))
const get = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
const limit = Number(get('--limit') || 30)
const out = get('--out')
if (!nick) { console.error('사용법: node fetch-member-posts.mjs "<닉네임>" [--limit 30] [--out posts.json]'); process.exit(1) }

async function gql(query, variables, token) {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ query, variables }) })
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.data
}
const t = await gql(`query{ tokens(networkDomain:"${NETWORK}"){ accessToken } }`)
const token = t.tokens.accessToken
const m = await gql(`query($q:String!){ searchMembers(query:$q, limit:5){ nodes { id name username tagline } } }`, { q: nick }, token)
const cands = m.searchMembers.nodes
const member = cands.find(x => x.name === nick) || cands[0]
if (!member) { console.error(`닉네임 "${nick}"을 찾지 못했어요. 프로필에 보이는 이름 그대로 적어 주세요.`); process.exit(2) }
const posts = []
let offset = 0
while (posts.length < limit) {
  const p = await gql(`query($id:ID!,$limit:Int!,$offset:Int){ memberPosts(memberId:$id, limit:$limit, offset:$offset){ totalCount nodes { id title createdAt url textContent tags { title } } } }`, { id: member.id, limit: Math.min(20, limit - posts.length), offset }, token)
  const nodes = p.memberPosts.nodes.filter(n => n.title && (n.textContent || '').length > 300)
  posts.push(...nodes.map(n => ({ id: n.id, title: n.title, url: n.url, createdAt: n.createdAt, tags: (n.tags || []).map(x => x.title), text: n.textContent })))
  if (p.memberPosts.nodes.length < 20) break
  offset += 20
  if (offset > 200) break
}
const result = { member: { id: member.id, name: member.name, tagline: member.tagline || '' }, posts }
const json = JSON.stringify(result, null, 1)
if (out) { const fs = await import('node:fs'); fs.writeFileSync(out, json); console.error(`저장: ${out} (${posts.length}편, 프로필 소개: "${result.member.tagline}")`) }
else console.log(json)
