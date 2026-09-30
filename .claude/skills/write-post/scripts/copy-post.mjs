#!/usr/bin/env node
// 초안(.md)을 서식 있는 깨끗한 HTML로 바꿔 **클립보드에 복사**한다. 멤버는 지피터스 글쓰기 화면 본문 칸에 붙여 넣기만 하면
// 소제목·목록·굵게·코드가 살아서 들어가고, 로컬 이미지는 데이터로 심어 두어 게시판이 붙여 넣을 때 서버에 올려 준다(alt 유지, 2026-09-30 실측).
// 첫 줄의 # 제목은 본문에서 뺀다(글쓰기 화면은 제목 칸이 따로 있다).
//   node copy-post.mjs AI_CASE_STUDY.md            # 본문 복사
//   node copy-post.mjs AI_CASE_STUDY.md --title    # 제목만 글자로 복사
// 외부 패키지·네트워크 없이 돌아간다. 종료 코드: 0 성공 / 1 인자 오류 / 2 클립보드에 못 넣음
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import os from 'node:os'

const args = process.argv.slice(2)
const src = args.find(a => a.endsWith('.md'))
const get = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
if (!src) { console.error('쓰는 법: node copy-post.mjs 초안.md [--title]'); process.exit(1) }
const dir = path.dirname(path.resolve(src))

let md = readFileSync(src, 'utf8').replace(/\r\n/g, '\n')
if (md.startsWith('---')) { const end = md.indexOf('\n---', 3); if (end > 0) md = md.slice(end + 4) }
const tm = md.match(/^\s*#\s+(.+?)\s*$/m)
const title = tm ? tm[1].trim() : ''
if (tm) md = md.replace(tm[0], '').replace(/^\s*\n/, '')

if (args.includes('--title')) {
  if (!title) { console.error('첫 줄에 # 제목이 없어요.'); process.exit(1) }
  const r = process.platform === 'darwin' ? spawnSync('pbcopy', [], { input: title })
    : process.platform === 'win32' ? spawnSync('powershell', ['-NoProfile', '-Command', 'Set-Clipboard -Value ([Console]::In.ReadToEnd())'], { input: title })
    : spawnSync('xclip', ['-selection', 'clipboard'], { input: title })
  if (r.status === 0) console.log(`제목을 복사했어요: ${title}`); else console.log(`제목: ${title}`)
  process.exit(0)
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
let embedded = 0, skipped = []
const imgSrc = u => {
  if (/^(https?:|data:)/.test(u)) return u
  // 로컬 이미지는 데이터로 심는다. 지피터스 편집기에 붙여 넣으면 그림을 서버에 올려 주고 alt도 남는다(2026-09-30 확인).
  const f = path.resolve(dir, decodeURIComponent(u))
  try {
    const ext = path.extname(f).slice(1).toLowerCase()
    if (!MIME[ext]) throw new Error('type')
    const buf = readFileSync(f)
    if (buf.length > 8 * 1024 * 1024) throw new Error('big')
    embedded++
    return `data:${MIME[ext]};base64,${buf.toString('base64')}`
  } catch { skipped.push(u); return pathToFileURL(f).href }
}
const inline = s => esc(s)
  .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, u) => `<img src="${imgSrc(u)}" alt="${alt}">`)
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')

const lines = md.split('\n')
const html = []
let i = 0
const flushPara = buf => { if (buf.length) html.push(`<p>${buf.map(inline).join('<br>')}</p>`); buf.length = 0 }
const para = []
while (i < lines.length) {
  const l = lines[i]
  if (/^```/.test(l)) {
    flushPara(para); const code = []; i++
    while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++])
    i++; html.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue
  }
  const h = l.match(/^(#{1,6})\s+(.*)$/)
  if (h) { flushPara(para); html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue }
  if (/^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) {
    flushPara(para); const ordered = /^\s*\d+\./.test(l); const items = []
    while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''))
    html.push(`<${ordered ? 'ol' : 'ul'}>${items.map(x => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); continue
  }
  if (/^>\s?/.test(l)) {
    flushPara(para); const q = []
    while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''))
    html.push(`<blockquote><p>${q.map(inline).join('<br>')}</p></blockquote>`); continue
  }
  if (/^\s*$/.test(l)) { flushPara(para); i++; continue }
  if (/^(-{3,}|\*{3,})$/.test(l.trim())) { flushPara(para); html.push('<hr>'); i++; continue }
  para.push(l); i++
}
flushPara(para)

const fragment = `<article>${html.join('\n')}</article>`
const tmp = path.join(os.tmpdir(), `write-post-clip-${process.pid}`)

function copyMac() {
  const hex = Buffer.from(fragment, 'utf8').toString('hex')
  // HTML만 넣으면 글자만 받는 칸에는 아무것도 안 붙는다. 글자 형식(마크다운 원문)도 같이 넣는다.
  const plain = md.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const scpt = `set the clipboard to {«class HTML»:«data HTML${hex}», «class utf8»:"${plain}"}`
  writeFileSync(tmp + '.scpt', scpt)
  const r = spawnSync('osascript', [tmp + '.scpt'], { stdio: 'ignore' })
  return r.status === 0
}
function copyWin() {
  const cf = b => { // CF_HTML 헤더(바이트 단위 오프셋)
    const pre = 'Version:0.9\r\nStartHTML:00000000\r\nEndHTML:00000000\r\nStartFragment:00000000\r\nEndFragment:00000000\r\n'
    const h1 = '<html><body><!--StartFragment-->', h2 = '<!--EndFragment--></body></html>'
    const body = h1 + b + h2
    const L = x => Buffer.byteLength(x, 'utf8'), pad = n => String(n).padStart(8, '0')
    const startHTML = L(pre), startFrag = startHTML + L(h1), endFrag = startFrag + L(b), endHTML = endFrag + L(h2)
    return pre.replace('StartHTML:00000000', 'StartHTML:' + pad(startHTML)).replace('EndHTML:00000000', 'EndHTML:' + pad(endHTML))
      .replace('StartFragment:00000000', 'StartFragment:' + pad(startFrag)).replace('EndFragment:00000000', 'EndFragment:' + pad(endFrag)) + body
  }
  writeFileSync(tmp + '.html', cf(fragment), 'utf8')
  writeFileSync(tmp + '.txt', md, 'utf8')
  const ps = `Add-Type -AssemblyName System.Windows.Forms
$h = [IO.File]::ReadAllText('${tmp.replace(/'/g, "''")}.html', [Text.Encoding]::UTF8)
$t = [IO.File]::ReadAllText('${tmp.replace(/'/g, "''")}.txt', [Text.Encoding]::UTF8)
$d = New-Object Windows.Forms.DataObject
$d.SetData([Windows.Forms.DataFormats]::Html, $h)
$d.SetData([Windows.Forms.DataFormats]::UnicodeText, $t)
[Windows.Forms.Clipboard]::SetDataObject($d, $true)`
  writeFileSync(tmp + '.ps1', '﻿' + ps, 'utf8')
  for (const exe of ['powershell', 'pwsh']) {
    const r = spawnSync(exe, ['-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp + '.ps1'], { stdio: 'ignore' })
    if (r.status === 0) return true
  }
  return false
}
function copyLinux() {
  const r = spawnSync('xclip', ['-selection', 'clipboard', '-t', 'text/html'], { input: fragment, stdio: ['pipe', 'ignore', 'ignore'] })
  return r.status === 0
}

let copied = false
try { copied = process.platform === 'darwin' ? copyMac() : process.platform === 'win32' ? copyWin() : copyLinux() } catch { copied = false }
if (copied) { console.log(`복사했어요. 본문 칸에서 전체 선택 → 붙여 넣기 하세요.${embedded ? ' 그림도 같이 들어가요.' : ''}${skipped.length ? ` (못 심은 그림: ${skipped.join(', ')})` : ''}`); process.exit(0) }
console.error('클립보드에 못 넣었어요. AI_CASE_STUDY.md를 열어 첫 줄 제목은 빼고 전체 복사해 주세요.')
process.exit(2)
