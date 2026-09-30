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
try { info = JSON.parse(read('install.json') || 'null') } catch {}
if (!local || !info || !info.repo_url) { console.log('설치 정보가 없어서 새 버전 확인을 건너뛰어요.'); process.exit(0) }

const cmdFor = () => {
  const tools = (info.tools || ['claude']).join(',')
  const scope = info.scope || 'global'
  const base = info.repo_url.replace(/\/+$/, '')
  if (process.platform === 'win32') return `$env:WRITE_POST_REPO_URL="${base}"; $env:WP_TOOLS="${tools}"; $env:WP_SCOPE="${scope}"; iwr -useb ${base}/install_win.ps1 | iex`
  return `curl -fsSL ${base}/install_mac.sh | WRITE_POST_REPO_URL=${base} bash -s -- ${tools} ${scope}`
}
if (process.argv.includes('--command')) { console.log(cmdFor()); process.exit(0) }

let remote = null
try {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000)
  const res = await fetch(`${info.repo_url.replace(/\/+$/, '')}/.claude/skills/write-post/VERSION?t=${Date.now()}`, { signal: ctl.signal, headers: { 'cache-control': 'no-cache' } })
  clearTimeout(t)
  if (res.ok) remote = (await res.text()).trim()
} catch {}
if (!remote) { console.log('새 버전 확인을 못 했어요(인터넷 연결). 그냥 진행해요.'); process.exit(0) }
if (remote === local) { console.log(`최신이에요 (${local}).`); process.exit(0) }
console.log(`새 버전이 있어요: 지금 ${local} → 최신 ${remote}`)
console.log('다시 설치하는 명령:')
console.log(cmdFor())
process.exit(10)
