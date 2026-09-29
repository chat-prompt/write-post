#!/usr/bin/env node
// AI 그림 한 장을 만든다. 구글 제미나이 이미지 모델을 쓴다.
//   node gen-image.mjs --prompt "..." --out ./case-post-images/hero.png [--model gemini-2.5-flash-image] [--ratio 16:9]
// API 키는 GEMINI_API_KEY 환경변수 → ~/.gpters/write-post/keys.json 의 "gemini" 순으로 찾는다.
// 종료 코드: 0 성공 / 2 API 키 없음 / 3 API 오류(한도·결제·모델) / 4 인자 오류
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const args = process.argv.slice(2)
const opt = { model: 'gemini-2.5-flash-image', ratio: '16:9' }
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--prompt') opt.prompt = args[++i]
  else if (a === '--out') opt.out = args[++i]
  else if (a === '--model') opt.model = args[++i]
  else if (a === '--ratio') opt.ratio = args[++i]
  else if (a === '--save-key') opt.saveKey = args[++i]
}

const keyFile = path.join(os.homedir(), '.gpters', 'write-post', 'keys.json')

if (opt.saveKey) {
  fs.mkdirSync(path.dirname(keyFile), { recursive: true })
  let cur = {}
  try { cur = JSON.parse(fs.readFileSync(keyFile, 'utf8')) } catch {}
  cur.gemini = opt.saveKey.trim()
  fs.writeFileSync(keyFile, JSON.stringify(cur, null, 2))
  try { fs.chmodSync(keyFile, 0o600) } catch {}
  console.log(`API 키를 저장했어요: ${keyFile}`)
  if (!opt.prompt) process.exit(0)
}

if (!opt.prompt || !opt.out) {
  console.error('쓰는 법: node gen-image.mjs --prompt "그림 설명" --out 저장할파일.png')
  process.exit(4)
}

let key = process.env.GEMINI_API_KEY
if (!key) { try { key = JSON.parse(fs.readFileSync(keyFile, 'utf8')).gemini } catch {} }
if (!key) {
  console.error('API 키가 없어요. https://aistudio.google.com/apikey 에서 받아서 --save-key 로 저장하세요.')
  process.exit(2)
}

const url = `https://generativelanguage.googleapis.com/v1beta/models/${opt.model}:generateContent`
const body = {
  contents: [{ parts: [{ text: opt.prompt }] }],
  generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: opt.ratio } },
}

let res
try {
  res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  })
} catch (e) {
  console.error(`인터넷 연결이 안 돼요: ${e.message}`)
  process.exit(3)
}

const text = await res.text()
if (!res.ok) {
  let msg = text.slice(0, 300)
  try { msg = JSON.parse(text).error?.message || msg } catch {}
  if (res.status === 429) console.error('무료 한도를 넘었거나 결제 설정이 필요해요. 잠시 뒤 다시 하거나 이미지 없이 진행하세요.')
  else if (res.status === 400 || res.status === 403) console.error('API 키가 틀렸거나 이 모델을 쓸 수 없어요.')
  else if (res.status === 404) console.error(`모델 이름이 없어요: ${opt.model}. --model 로 다른 이름을 주세요.`)
  console.error(`(${res.status}) ${msg}`)
  process.exit(3)
}

let json
try { json = JSON.parse(text) } catch { console.error('응답을 읽을 수 없어요.'); process.exit(3) }
const parts = json.candidates?.[0]?.content?.parts || []
const img = parts.find(p => p.inlineData?.data)
if (!img) {
  const why = json.candidates?.[0]?.finishReason || json.promptFeedback?.blockReason || '이유 없음'
  console.error(`그림이 안 나왔어요 (${why}). 설명을 바꿔서 다시 해 보세요.`)
  process.exit(3)
}

fs.mkdirSync(path.dirname(path.resolve(opt.out)), { recursive: true })
fs.writeFileSync(opt.out, Buffer.from(img.inlineData.data, 'base64'))
console.log(`저장했어요: ${opt.out} (${opt.model}, ${opt.ratio})`)
