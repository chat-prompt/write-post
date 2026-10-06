#!/usr/bin/env node
// 설치된 스킬이 최신인지 본다. 설치할 때 남긴 install.json(어디서 받았는지)과 VERSION을 원격 VERSION과 비교한다.
//   node check-update.mjs            # 종료 코드 0: 최신이거나 확인 못 함(인터넷 없음 등, 조용히 넘어간다) / 10: 새 버전 있음
//   node check-update.mjs --command  # 새 버전이 있을 때 다시 설치하는 명령만 출력한다
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const read = f => { try { return readFileSync(path.join(root, f), 'utf8').trim() } catch { return null } }
const local = read('VERSION')
let info = null
const raw = read('install.json') || ''
try { info = JSON.parse(raw || 'null') } catch {}
if (!info && raw) {  // 예전 설치본의 깨진 JSON(["claude"codex"])도 읽는다
  const m = raw.match(/"repo_url"\s*:\s*"([^"]+)"/)
  if (m) info = { repo_url: m[1], tools: [...raw.matchAll(/\b(claude|codex|gemini|opencode|antigravity)\b/g)].map(x => x[1]).filter((v, i, a) => a.indexOf(v) === i), scope: (raw.match(/"scope"\s*:\s*"([^"]+)"/) || [])[1] || 'global' }
}
if (!local || !info || !info.repo_url) { console.log('설치 정보가 없어서 새 버전 확인을 건너뛰어요.'); process.exit(0) }

const cmdFor = base => {
  const tools = (info.tools || ['claude']).join(',')
  const scope = info.scope || 'global'
  if (process.platform === 'win32') return `$env:WRITE_POST_REPO_URL="${base}"; $env:WP_TOOLS="${tools}"; $env:WP_SCOPE="${scope}"; iwr -useb ${base}/install_win.ps1 | iex`
  return `curl -fsSL ${base}/install_mac.sh | WRITE_POST_REPO_URL=${base} bash -s -- ${tools} ${scope}`
}

let remote = null
let remoteBase = null
try {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000)
  const release = await fetch('https://api.github.com/repos/chat-prompt/write-post/releases/latest', { signal: ctl.signal, headers: { 'accept': 'application/vnd.github+json' } })
  if (release.ok) {
    const tag = (await release.json()).tag_name
    if (/^v\d+\.\d+\.\d+$/.test(tag)) remoteBase = `https://raw.githubusercontent.com/chat-prompt/write-post/${tag}`
  }
  const res = remoteBase && await fetch(`${remoteBase}/.claude/skills/write-post/VERSION`, { signal: ctl.signal })
  clearTimeout(t)
  if (res?.ok) remote = (await res.text()).trim()
} catch {}
if (process.argv.includes('--command')) { if (remoteBase && remote) console.log(cmdFor(remoteBase)); else console.error('검증된 최신 버전을 확인하지 못했어요.'); process.exit(remoteBase && remote ? 0 : 1) }
if (!remote) { console.log('새 버전 확인을 못 했어요(인터넷 연결). 그냥 진행해요.'); process.exit(0) }
// 버전은 "2026-09-30.2" 꼴. 캐시 때문에 원격이 옛 값으로 올 수 있으니, 원격이 더 새것일 때만 알린다.
const key = v => (v.match(/\d+/g) || []).map(Number)
const newer = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 } return false }
if (!newer(remote, local)) { console.log(`최신이에요 (${local}).`); process.exit(0) }
console.log(`새 버전이 있어요: 지금 ${local} → 최신 ${remote}`)
console.log('다시 설치하는 명령:')
console.log(cmdFor(remoteBase))
process.exit(10)
