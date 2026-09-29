#!/usr/bin/env node
// 초안(.md)을 서식 있는 HTML로 바꿔 **클립보드에 복사**한다. 멤버는 지피터스 글쓰기 화면에 붙여 넣기만 하면 제목·목록·굵게·코드가 살아서 들어간다.
// 클립보드에 못 넣는 환경이면 HTML 파일을 브라우저로 열어 준다(거기서 전체 선택 → 복사).
//   node open-preview.mjs AI_CASE_STUDY.md            # 클립보드에 복사 (안 되면 브라우저로 염)
//   node open-preview.mjs AI_CASE_STUDY.md --open     # 브라우저로만 연다
//   node open-preview.mjs AI_CASE_STUDY.md --no-open  # HTML 파일만 만든다
// 외부 패키지·네트워크 없이 돌아간다. 종료 코드: 0 성공 / 1 인자 오류 / 2 복사도 열기도 실패(파일은 만들어짐)
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import os from 'node:os'

const args = process.argv.slice(2)
const src = args.find(a => a.endsWith('.md'))
const get = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
if (!src) { console.error('쓰는 법: node open-preview.mjs 초안.md [--out 파일.html] [--no-open]'); process.exit(1) }
const out = path.resolve(get('--out') || src.replace(/\.md$/, '.html'))
const dir = path.dirname(path.resolve(src))

let md = readFileSync(src, 'utf8').replace(/\r\n/g, '\n')
if (md.startsWith('---')) { const end = md.indexOf('\n---', 3); if (end > 0) md = md.slice(end + 4) }

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const imgSrc = u => /^(https?:|data:|\/)/.test(u) ? u : pathToFileURL(path.resolve(dir, u)).href
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

const page = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(path.basename(src))}</title>
<style>
 body{margin:0;background:#fff;color:#1f2937;font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif}
 .tip{background:#fff7d6;border-bottom:1px solid #f0d97a;padding:12px 20px;font-size:15px}
 .post{max-width:720px;margin:0 auto;padding:24px 20px 80px;font-size:17px;line-height:1.8}
 h1{font-size:28px;line-height:1.35} h2{font-size:22px;margin-top:40px} h3{font-size:19px}
 img{max-width:100%;height:auto;display:block;margin:12px 0}
 pre{background:#f3f4f6;padding:12px 14px;overflow:auto;border-radius:6px;font-size:14px} code{font-family:Menlo,Consolas,monospace}
 blockquote{border-left:4px solid #d1d5db;margin:0;padding:4px 16px;color:#4b5563}
</style></head><body>
<div class="tip">이 화면에서 전체 선택(Ctrl+A, 맥은 Cmd+A) → 복사(Ctrl+C, Cmd+C) → 지피터스 글쓰기 화면에 붙여 넣기(Ctrl+V, Cmd+V). 이 노란 줄은 같이 복사돼도 지우면 돼요.</div>
<article class="post">
${html.join('\n')}
</article></body></html>`
writeFileSync(out, page)
console.log(`만들었어요: ${out}`)

if (args.includes('--no-open')) process.exit(0)

// 붙여 넣을 본문만(노란 안내 줄 제외)
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
if (!args.includes('--open')) {
  try { copied = process.platform === 'darwin' ? copyMac() : process.platform === 'win32' ? copyWin() : copyLinux() } catch { copied = false }
}
if (copied) { console.log('글을 복사했어요. 지피터스 글쓰기 화면에 붙여 넣으세요(Ctrl+V, 맥은 Cmd+V). 이미지는 따로 넣어야 해요.'); process.exit(0) }

const url = pathToFileURL(out).href
const cmd = process.platform === 'darwin' ? ['open', [url]]
  : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
  : ['xdg-open', [url]]
try {
  const p = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true })
  p.on('error', () => { console.error(`브라우저를 못 열었어요. 이 파일을 직접 더블클릭해서 열어 주세요: ${out}`); process.exit(2) })
  p.unref()
  console.log('브라우저에 열었어요. 그 화면에서 전체 선택 → 복사 → 글쓰기 화면에 붙여 넣으세요.')
} catch {
  console.error(`브라우저를 못 열었어요. 이 파일을 직접 더블클릭해서 열어 주세요: ${out}`); process.exit(2)
}
