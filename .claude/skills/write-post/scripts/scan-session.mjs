#!/usr/bin/env node
// AI 작업 기록을 읽어 DEVLOG.md와 재료표(materials.json)를 만든다. 외부 패키지 없음.
// 사용법:
//   node scan-session.mjs                          # 현재 폴더의 Claude Code 세션
//   node scan-session.mjs --cwd /path/to/project   # 다른 폴더
//   node scan-session.mjs --paste chat.txt         # 붙여 넣은 대화(챗GPT·클로드 웹 등)
//   옵션: --out DEVLOG.md  --json materials.json  --days 30 (최근 N일 세션만)
// 출력: DEVLOG.md(사람이 읽는 기록), materials.json(재료 여덟 가지 후보). 찾지 못한 칸은 null.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const cwd = resolve(get('--cwd', process.cwd()))
const paste = get('--paste')
const outMd = get('--out', 'DEVLOG.md')
const outJson = get('--json', 'materials.json')
const days = Number(get('--days', 30))

// ---------- 1. 읽기 ----------
// turn: { t: Date|null, who: 'user'|'ai', text, tools:[{name, path, cmd, url, q}], errors:[str], model, out_tokens }
function readClaudeCode() {
  const enc = cwd.replace(/[^A-Za-z0-9]/g, '-')
  const dir = join(homedir(), '.claude', 'projects', enc)
  if (!existsSync(dir)) return { turns: [], files: [] }
  const since = Date.now() - days * 864e5
  const files = readdirSync(dir).filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
    .map(f => join(dir, f)).filter(f => statSync(f).mtimeMs >= since)
  const turns = []
  for (const f of files) {
    const seen = new Set()
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line) continue
      let d; try { d = JSON.parse(line) } catch { continue }
      const t = d.timestamp ? new Date(d.timestamp) : null
      if (d.type === 'queue-operation' && d.operation === 'enqueue' && d.content) {
        turns.push({ t, who: 'user', text: d.content.trim(), tools: [], errors: [], src: f, queued: true }); continue
      }
      if (d.type !== 'user' && d.type !== 'assistant') continue
      const m = d.message || {}; const c = m.content
      if (d.type === 'user') {
        if (d.isMeta || d.isCompactSummary) continue
        let text = ''; const errors = []; const answers = []
        if (typeof c === 'string') text = c
        else for (const x of c || []) {
          if (x.type === 'text') text += x.text
          if (x.type === 'tool_result' && x.is_error) errors.push(String(typeof x.content === 'string' ? x.content : JSON.stringify(x.content)).slice(0, 300))
        }
        if (d.toolUseResult && d.toolUseResult.answers) answers.push(JSON.stringify(d.toolUseResult.answers))
        text = text.trim()
        if (text.startsWith('<') || text.startsWith('This session is being continued') || text.startsWith('[Request interrupted')) text = ''
        if (!text && !errors.length && !answers.length) continue
        if (text && seen.has(text)) text = ''  // 큐 메시지가 user로도 남은 경우
        if (text) seen.add(text)
        turns.push({ t, who: 'user', text, tools: [], errors, answers, src: f })
      } else {
        let text = ''; const tools = []
        for (const x of c || []) {
          if (x.type === 'text') text += x.text
          if (x.type === 'tool_use') {
            const inp = x.input || {}
            tools.push({ name: x.name, path: inp.file_path || inp.notebook_path || null, cmd: inp.command || null, url: inp.url || null, q: x.name === 'AskUserQuestion' ? (inp.questions || []).map(q => q.question) : null })
          }
        }
        turns.push({ t, who: 'ai', text: text.trim(), tools, errors: [], model: m.model || null, out_tokens: (m.usage || {}).output_tokens || 0, src: f })
      }
    }
  }
  turns.sort((a, b) => (a.t?.getTime() || 0) - (b.t?.getTime() || 0))
  return { turns, files }
}

function readPaste(file) {
  const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const marks = /^\s*(?:\[?(나|사용자|User|You|You said|나의 말|질문)\]?\s*[:：]?|\[?(AI|Assistant|ChatGPT|Claude|Gemini|제미나이|클로드|챗GPT|ChatGPT said|답변)\]?\s*[:：]?)\s*$/im
  const turns = []; let cur = null
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*\[?(나|사용자|User|You|You said|나의 말|질문|AI|Assistant|ChatGPT|Claude|Gemini|제미나이|클로드|챗GPT|ChatGPT said|답변)\]?\s*[:：]?\s*(.*)$/i)
    if (m) {
      const who = /^(나|사용자|User|You|You said|나의 말|질문)$/i.test(m[1]) ? 'user' : 'ai'
      cur = { t: null, who, text: m[2] || '', tools: [], errors: [], src: file }; turns.push(cur)
    } else if (cur) cur.text += '\n' + line
  }
  for (const x of turns) x.text = x.text.trim()
  if (turns.length < 2) console.error('대화를 [나]/[AI] 또는 User:/Assistant: 같은 표시로 나누지 못했어요. 한 줄에 화자 표시를 두고 다시 붙여 주세요.')
  return { turns: turns.filter(x => x.text), files: [file] }
}

const { turns, files } = paste ? readPaste(paste) : readClaudeCode()
if (!turns.length) {
  console.error(paste ? '붙여 넣은 대화에서 턴을 찾지 못했어요.' : `이 폴더의 Claude Code 세션을 찾지 못했어요: ${cwd}`)
  process.exit(2)
}

// ---------- 2. 재료 뽑기 ----------
const users = turns.filter(x => x.who === 'user' && x.text && !x.text.startsWith('/'))
const ais = turns.filter(x => x.who === 'ai')
const firstReq = users.find(x => x.text.length >= 4) || users[0] || null
const STUCK = /(안\s?돼|안\s?됨|안\s?나와|안\s?되|다시|아니|왜|뭐야|에러|오류|이상|틀렸|실패|막혔|안 보여|안 열|깨져)/
const stuck = []
for (let i = 0; i < turns.length; i++) {
  const x = turns[i]
  if (x.who === 'user' && x.errors && x.errors.length) stuck.push({ kind: 'tool_error', t: x.t, text: x.errors[0], next_user: null })
  if (x.who === 'user' && x.text && STUCK.test(x.text)) {
    const prevAi = [...turns.slice(0, i)].reverse().find(y => y.who === 'ai' && y.text)
    stuck.push({ kind: 'user_pushback', t: x.t, text: x.text, before_ai: prevAi ? prevAi.text.slice(0, 300) : null })
  }
  if (x.who === 'ai' && /(못 했|실패했|되지 않|오류가|에러가|막혔|권한이 없|찾지 못)/.test(x.text)) stuck.push({ kind: 'ai_reports_block', t: x.t, text: x.text.slice(0, 300) })
  else if (x.who === 'ai' && /(이 아니라|가 아니라|은 아니고|는 아니고|잘못|않습니다\. )/.test(x.text.slice(0, 160))) stuck.push({ kind: 'ai_corrects', t: x.t, text: x.text.slice(0, 300) })
}
// 방향 바꾼 한 마디: 막힌 지점 다음에 온 사용자 메시지
const PRI = { user_pushback: 0, ai_reports_block: 1, ai_corrects: 2, tool_error: 3 }
stuck.sort((a, b) => PRI[a.kind] - PRI[b.kind] || (a.t?.getTime() || 0) - (b.t?.getTime() || 0))
for (const s of stuck) {
  const after = users.find(u => s.t && u.t && u.t > s.t && u.text !== s.text)
  s.next_user = after ? after.text : null
}
const written = new Set(), edited = new Set(), cmds = [], urls = new Set(), asks = []
for (const a of ais) for (const tl of a.tools || []) {
  if (tl.name === 'Write' && tl.path) written.add(tl.path)
  if ((tl.name === 'Edit' || tl.name === 'MultiEdit' || tl.name === 'NotebookEdit') && tl.path) edited.add(tl.path)
  if (tl.cmd) cmds.push(tl.cmd)
  if (tl.url) urls.add(tl.url)
  if (tl.q) asks.push(...tl.q)
}
for (const a of ais) for (const u of (a.text.match(/https?:\/\/[^\s)\]>"']+/g) || [])) if (!/localhost|127\.0\.0\.1/.test(u)) urls.add(u)
const errorsN = turns.reduce((n, x) => n + (x.errors ? x.errors.length : 0), 0)
const models = [...new Set(ais.map(a => a.model).filter(Boolean))]
const outTokens = ais.reduce((n, a) => n + (a.out_tokens || 0), 0)
const commits = cmds.filter(c => /git commit/.test(c)).length
const deploys = cmds.filter(c => /(^|&&|;|\|)\s*(npx\s+)?(vercel|netlify|firebase deploy|wrangler deploy|gh-pages)\b/m.test(c)).length
const MEDIA = /[\w가-힣.-]+\.(mp4|mov|png|jpg|jpeg|gif|pdf|xlsx|csv|pptx|docx|html|zip|json|md)\b/g
const mentioned = new Set()
for (const a of ais.slice(-6)) for (const m of (a.text.match(MEDIA) || [])) if (!/^(README|DEVLOG|CLAUDE|package)/.test(m)) mentioned.add(m)
const stamped = turns.filter(x => x.t)
let workMin = null, activeMin = null, firstT = null, lastT = null, blocks = []
if (stamped.length >= 2 && firstReq && firstReq.t) {
  firstT = firstReq.t; lastT = stamped[stamped.length - 1].t
  // 30분 넘게 쉬면 블록을 나눈다. 작업 시간 = 블록 길이의 합(쉰 시간 제외). 세션 전체 길이는 쓰지 않는다.
  let bs = stamped[0].t, be = stamped[0].t
  for (let i = 1; i < stamped.length; i++) {
    const g = stamped[i].t - be
    if (g > 30 * 60000) { blocks.push({ start: bs, end: be, min: Math.round((be - bs) / 60000) }); bs = stamped[i].t }
    be = stamped[i].t
  }
  blocks.push({ start: bs, end: be, min: Math.round((be - bs) / 60000) })
  activeMin = blocks.reduce((n, b) => n + b.min, 0)
  workMin = activeMin
}
const lastAi = ais.length ? ais[ais.length - 1].text : ''
const remaining = [
  ...users.filter(u => /(나중에|일단 빼|일단 넘어|다음에|보류|미루)/.test(u.text)).map(u => u.text),
  ...(lastAi.match(/[^\n]*(아직|남은|다음 단계|미완|TODO|해야)[^\n]*/g) || []).slice(0, 5),
]
const materials = {
  source: paste ? 'paste' : 'claude-code', files: files.map(f => basename(f)), cwd,
  date: firstT ? firstT.toISOString().slice(0, 10) : null,
  first_request: firstReq ? firstReq.text : null,
  user_messages: users.map(u => u.text),
  stuck_moments: stuck.slice(0, 8),
  numbers: { files_written: written.size, files_edited: edited.size, commands: cmds.length, tool_errors: errorsN, questions_asked: asks.length, commits, deploys },
  time: { work_min: workMin, active_min: activeMin, first: firstT, last: lastT, note: paste ? '붙여 넣은 대화에는 시각이 없어요. 날짜와 걸린 시간은 멤버에게 묻는다.' : null },
  models, output_tokens: outTokens || null, cost: null,
  results: { files: [...written].filter(p => !/\/\.claude\//.test(p)).map(p => basename(p)).slice(0, 20), mentioned: [...mentioned].slice(0, 12), urls: [...urls].slice(0, 20) },
  time_blocks: blocks.map(b => ({ start: b.start, end: b.end, min: b.min })),
  remaining: remaining.slice(0, 8),
  resources_opened: [...urls].filter(u => !/gpters\.org/.test(u)).slice(0, 10),
  ask_questions: asks.slice(0, 10),
}

// ---------- 3. DEVLOG ----------
const fmt = t => t ? t.toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '시각 없음'
const L = []
L.push(`# ${basename(cwd)} - 개발 로그`, '', `생성: ${new Date().toISOString().slice(0, 10)} · 출처: ${materials.source} · 기록 ${files.length}개 · 사용자 메시지 ${users.length}개 · AI 응답 ${ais.length}개`, '')
L.push(`## ${materials.date || '날짜 미상 [멤버에게 확인]'}`, '')
let n = 0
for (let i = 0; i < turns.length; i++) {
  const x = turns[i]
  if (x.who !== 'user' || !x.text) continue
  n++
  L.push(`### ${n}. ${x.text.split('\n')[0].slice(0, 40)}${x.queued ? ' (작업 중에 이어 보낸 말)' : ''}`, '', `> ${fmt(x.t)}`, '', '```', x.text, '```', '')
  if (x.answers && x.answers.length) L.push(`- 질문에 답함: ${x.answers[0].slice(0, 200)}`)
  // 다음 사용자 메시지 전까지 AI가 한 일
  const acts = []
  for (let j = i + 1; j < turns.length && !(turns[j].who === 'user' && turns[j].text); j++) {
    const a = turns[j]
    if (a.who === 'user' && a.errors.length) acts.push(`⚠️ 도구 에러: ${a.errors[0].split('\n')[0].slice(0, 160)}`)
    if (a.who !== 'ai') continue
    for (const tl of a.tools || []) {
      if (tl.name === 'Write') acts.push(`파일 작성: ${basename(tl.path || '')}`)
      else if (tl.name === 'Edit' || tl.name === 'MultiEdit') acts.push(`파일 수정: ${basename(tl.path || '')}`)
      else if (tl.name === 'Bash' && tl.cmd) acts.push(`명령: ${tl.cmd.split('\n')[0].slice(0, 100)}`)
      else if (tl.name === 'AskUserQuestion') acts.push(`질문: ${(tl.q || []).join(' / ').slice(0, 160)}`)
      else if (tl.url) acts.push(`열어 봄: ${tl.url}`)
    }
    if (a.text) acts.push(`AI: ${a.text.replace(/\s+/g, ' ').slice(0, 220)}`)
  }
  const uniq = [...new Set(acts)].slice(0, 14)
  if (uniq.length) L.push(...uniq.map(s => `- ${s}`), '')
}
L.push('## 소요 시간', '', workMin != null ? `- 작업 시간(30분 넘게 쉰 구간 제외): ${workMin}분` : '- 시각 정보 없음 (붙여 넣은 대화). 날짜와 걸린 시간은 멤버에게 묻는다.')
for (const b of blocks) L.push(`  - ${fmt(b.start)} ~ ${fmt(b.end).slice(11)} (${b.min}분)`)
L.push('')
L.push('## 재료 후보', '', `- 처음 요청: ${materials.first_request ? '"' + materials.first_request.split('\n')[0].slice(0, 120) + '"' : '없음'}`)
for (const s of materials.stuck_moments) L.push(`- 막힌 순간(${s.kind}): ${s.text.replace(/\s+/g, ' ').slice(0, 160)}${s.next_user ? ' → 그 뒤 멤버: "' + s.next_user.replace(/\s+/g, ' ').slice(0, 100) + '"' : ''}`)
L.push(`- 숫자: 파일 작성 ${written.size}개 · 수정 ${edited.size}개 · 명령 ${cmds.length}회 · 도구 에러 ${errorsN}회 · 커밋 ${commits}회 · 배포 명령 ${deploys}회`)
L.push(`- 모델: ${models.join(', ') || '없음'} · 출력 토큰: ${outTokens || '없음'} · 비용: 로그에 없음`)
L.push(`- 결과물: ${[...materials.results.files, ...materials.results.mentioned].join(', ') || '파일 없음'}${materials.results.urls.length ? ' · 주소: ' + materials.results.urls.slice(0, 5).join(' ') : ''}`)
L.push(`- 아직 안 된 것: ${materials.remaining.map(r => r.replace(/\s+/g, ' ').slice(0, 100)).join(' / ') || '없음'}`)
L.push(`- 세션에서 연 자료: ${materials.resources_opened.join(' ') || '없음'}`, '')
writeFileSync(outMd, L.join('\n'))
writeFileSync(outJson, JSON.stringify(materials, null, 2))
console.log(`✓ ${outMd} (요청 ${users.length}개, 막힌 순간 ${stuck.length}개, ${workMin != null ? '작업 ' + workMin + '분' : '시각 없음'}) · ${outJson}`)
if (paste) console.log('붙여 넣은 대화라 날짜·걸린 시간·모델은 비어 있어요. 3-3에서 묻는다.')
