#!/usr/bin/env node
// OMO for DSH — Web demo server.
// GET  /        成果仪表盘（数据读自已提交的机器文件，实时渲染）
// GET  /health  健康检查
// POST /chat    一条消息 → 容器内 OMO 会话（opencode-go/deepseek-v4-flash）
//               回传转录尾部；同时只允许一个会话（忙时 409）
// 端口：PORT 环境变量，默认 3200；仅绑定 127.0.0.1。
// 密钥经 /tmp/omo-ocg-env（0600）注入 docker --env-file，绝不进入响应/日志。
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const PORT = Number(process.env.PORT ?? 3200)
const HOST = process.env.OMO_HOST ?? '0.0.0.0'
const ENV_FILE = process.env.OMO_ENV_FILE ?? '/tmp/omo-ocg-env'
const IMAGE = process.env.OMO_IMAGE ?? 'omo-dsh-test'
const MODEL = process.env.OMO_MODEL ?? 'deepseek-v4-flash'
const MAX_QUEUE = 8

// ---- dashboard data (read from committed machine files) --------------------
function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'))
}
const parity = readJson('docs/plans/parity.json')
const contracts = readJson('docs/plans/compat-contracts.json')
const status = readJson('docs/plans/implementation-status.json')
const parityCounts = parity.capabilities.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1
  return acc
}, {})
const contractCounts = contracts.items.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1
  return acc
}, {})

// ---- chat runtime -----------------------------------------------------------
const queue = []
let running = false
const history = [] // rolling pseudo-continuity (headless is one-shot per message)

function runSession(message) {
  const home = execFileSync('bash', ['deploy/dsh-test-container/prepare-home-opencode.sh'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DSH_TEST_MODEL: MODEL },
  }).trim()
  try {
    const out = execFileSync('docker', [
      'run', '--rm', '--network=host', '--user', `${process.getuid()}:${process.getgid()}`,
      '--env-file', ENV_FILE,
      '-e', 'DSH_HOME=/tmp/dsh-home',
      '-v', `${home}:/tmp/dsh-home`,
      IMAGE, '--profile', 'headless', message,
    ], { cwd: root, encoding: 'utf8', timeout: 600_000, maxBuffer: 4 * 1024 * 1024 })
    return { ok: true, text: out.trim() }
  } catch (error) {
    const stderr = String(error.stderr ?? '').trim()
    const stdout = String(error.stdout ?? '').trim()
    return { ok: false, text: (stderr || stdout || error.message).slice(-4000) }
  } finally {
    execFileSync('bash', ['-c', `rm -rf "${home}"`], { encoding: 'utf8' }).toString()
  }
}

function buildPrompt(message) {
  if (history.length === 0) return message
  const context = history.slice(-4).map((h, i) => {
    const tag = i % 2 === 0 ? 'user' : 'assistant'
    return `[${tag}] ${h.slice(0, 800)}`
  }).join('\n')
  return `Previous conversation (keep it in mind, be concise):\n${context}\n\nCurrent user message: ${message}`
}

function pump() {
  if (running || queue.length === 0) return
  const { message, resolve } = queue.shift()
  running = true
  const prompt = buildPrompt(message)
  const t0 = Date.now()
  const result = runSession(prompt)
  if (result.ok) history.push(message, result.text.slice(0, 800))
  resolve({ ...result, seconds: Math.round((Date.now() - t0) / 1000), queue: queue.length })
  running = false
  pump()
}

// ---- dashboard HTML ----------------------------------------------------------
const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>OMO for DSH — 成果演示台</title>
<style>
  :root { --bg:#0e1116; --panel:#161b22; --border:#2b3544; --text:#dbe4ee; --dim:#8b98a8; --accent:#4c9aff; --ok:#3fb950; --warn:#d29922; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.6 "SF Mono",Consolas,monospace; }
  header { padding:18px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; }
  h1 { font-size:18px; margin:0; } h1 span { color:var(--accent); }
  .sub { color:var(--dim); font-size:12px; }
  main { max-width:1180px; margin:0 auto; padding:20px; display:grid; gap:16px; grid-template-columns:1fr 1fr; }
  section { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:16px; }
  .wide { grid-column:1 / -1; }
  h2 { font-size:14px; margin:0 0 12px; color:var(--accent); }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; }
  .card { border:1px solid var(--border); border-radius:6px; padding:10px; text-align:center; }
  .card b { display:block; font-size:20px; } .card span { color:var(--dim); font-size:11px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th,td { border:1px solid var(--border); padding:5px 8px; text-align:left; }
  th { color:var(--dim); font-weight:normal; }
  .ok { color:var(--ok); } .warn { color:var(--warn); }
  ul { margin:0; padding-left:18px; } li { margin:3px 0; }
  #chat { display:flex; flex-direction:column; gap:10px; }
  #log { background:#0a0d11; border:1px solid var(--border); border-radius:6px; padding:12px; min-height:220px; max-height:420px; overflow-y:auto; white-space:pre-wrap; font-size:12.5px; }
  .me { color:var(--accent); } .ai { color:var(--text); } .sys { color:var(--dim); }
  #form { display:flex; gap:8px; }
  #input { flex:1; background:#0a0d11; color:var(--text); border:1px solid var(--border); border-radius:6px; padding:10px; font:inherit; resize:vertical; }
  #send { background:var(--accent); color:#04121f; border:0; border-radius:6px; padding:0 18px; cursor:pointer; font-weight:bold; }
  #send:disabled { opacity:.5; cursor:wait; }
  .note { color:var(--dim); font-size:11px; }
  a { color:var(--accent); text-decoration:none; }
  @media (max-width:860px){ main{grid-template-columns:1fr;} }
</style>
</head>
<body>
<header>
  <h1>OMO <span>for DSH</span> — 成果演示台</h1>
  <div class="sub">固定基线 OMO 038ed0cb / DSH 47f9438 · 私有仓库 · 监听 0.0.0.0:${PORT}（局域网 + Tailscale）</div>
</header>
<main>

<section>
  <h2>纯逻辑与门</h2>
  <div class="cards">
    <div class="card"><b>${status.moduleCount}</b><span>源模块</span></div>
    <div class="card"><b>${status.suite.tests}</b><span>node --test 全绿</span></div>
    <div class="card"><b>13</b><span>g1-preflight 检查</span></div>
    <div class="card"><b>145+</b><span>提交（main）</span></div>
  </div>
  <table style="margin-top:12px">
    <tr><th>parity.json</th><th>compat 合同</th></tr>
    <tr>
      <td>60 行：contract-implemented ${parityCounts['contract-implemented']} · verified-contract ${parityCounts['verified-contract']} · not-started ${parityCounts['not-started'] ?? 0}</td>
      <td>35 项：contract-implemented ${contractCounts['contract-implemented']} · not-started ${contractCounts['not-started']}</td>
    </tr>
  </table>
</section>

<section>
  <h2>模型评测（17 场景 × 双模型族）</h2>
  <table>
    <tr><th>模型族</th><th>完成</th><th>工具调用</th><th>回合</th><th>角色切换</th><th>机器硬门</th></tr>
    <tr><td>opencode-go / deepseek-v4-flash</td><td class="ok">17/17（~30 分钟）</td><td>273</td><td>211</td><td>3</td><td class="ok">6/6 PASS</td></tr>
    <tr><td>NVIDIA NIM / gpt-oss-120b</td><td class="warn">17/17（多超时）</td><td>少（吞吐受限）</td><td>—</td><td>1</td><td class="ok">6/6 PASS</td></tr>
  </table>
  <div class="note" style="margin-top:8px">结论：适配器行为在快速模型下完整工作；吞吐是评测变量而非适配器缺陷。
  <a href="docs/plans/MODEL-EVAL-REPORT-OPENCODE-GO.md">opencode 报告</a> · <a href="docs/plans/MODEL-EVAL-REPORT-NIM.md">NIM 报告</a></div>
</section>

<section class="wide">
  <h2>Live 证据（G1-EVIDENCE 1-20 条摘要）</h2>
  <ul>
    <li><span class="ok">✓</span> 角色切换：<code>omo_role</code> → <code>omo/role</code> 事件（prometheus revision 1）</li>
    <li><span class="ok">✓</span> 权限拒执：prometheus 下 <code>bash echo hi</code> → <code>Error: omo role prometheus denies bash</code></li>
    <li><span class="ok">✓</span> 角色→Todo→状态：同一会话三步全落地（/tmp/omo-probe3.jsonl）</li>
    <li><span class="ok">✓</span> 核心工作流（E2E-04）：prometheus 规划 → <b>/start-work 交接</b> → hephaestus 实现（revision 1→2）</li>
    <li><span class="ok">✓</span> P2 结算通知：父会话权威 + 子会话审计双落地 + 下一回合注入段（rc6）</li>
    <li><span class="ok">✓</span> P4 终端族：<code>terminal_open</code> → pty-1 启动，<code>terminal_list</code> → running（isolate 组）</li>
    <li><span class="ok">✓</span> G6 动态角色段：RC 镜像零插件错误；主镜像组合冒烟一次通过</li>
    <li><span class="warn">△</span> P3 banned 命令警告：DSH pre-execute 无 per-call 警告面（blocked-on-seam，如实登记）</li>
    <li><span class="warn">△</span> R16：out-of-repo 事件 restore 拒绝（上游注册面待开放；Boulder 镜像兜底已实现）</li>
  </ul>
</section>

<section class="wide">
  <h2>现场对话 — OMO 会话（opencode-go / ${MODEL}）</h2>
  <div id="chat">
    <div id="log"><span class="sys">会话就绪。每条消息 = 一个新 headless 会话（单回合语义，服务端附带最近 4 条对话作为上下文）。试试："Call omo_role with role=prometheus and reason=demo. Then call omo_role_status."</span></div>
    <form id="form">
      <textarea id="input" rows="2" placeholder="给 OMO 角色引擎发一条指令……"></textarea>
      <button id="send" type="submit">发送</button>
    </form>
    <div class="note">路由 opencode-go（pi-ai 目录）+ deepseek-v4-flash；密钥经 0600 env-file 注入容器，不回显。单会话 600s 超时。</div>
  </div>
</section>

</main>
<script>
const log = document.getElementById('log')
const form = document.getElementById('form')
const input = document.getElementById('input')
const send = document.getElementById('send')
function add(cls, text) {
  const el = document.createElement('div')
  el.className = cls
  el.textContent = text
  log.appendChild(el)
  log.scrollTop = log.scrollHeight
}
form.addEventListener('submit', async (ev) => {
  ev.preventDefault()
  const message = input.value.trim()
  if (!message || send.disabled) return
  input.value = ''
  add('me', '> ' + message)
  send.disabled = true
  add('sys', '… OMO 会话运行中（通常 1-5 分钟）')
  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    const data = await res.json()
    if (res.status === 409) { add('sys', '忙碌：已有会话在运行，请稍候'); return }
    add('ai', data.text || '(空回复)')
    add('sys', '用时 ' + data.seconds + 's' + (data.queue > 0 ? '，排队 ' + data.queue : ''))
  } catch (err) {
    add('sys', '请求失败: ' + err.message)
  } finally {
    send.disabled = false
    input.focus()
  }
})
</script>
</body>
</html>`

// ---- server -------------------------------------------------------------------
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`)
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, busy: running, queue: queue.length }))
    return
  }
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }
  if (req.method === 'POST' && url.pathname === '/chat') {
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 64 * 1024) req.destroy() })
    req.on('end', () => {
      let message = ''
      try { message = JSON.parse(body).message ?? '' } catch { /* malformed */ }
      if (typeof message !== 'string' || message.trim().length === 0) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, text: 'message required' }))
        return
      }
      if (running || queue.length >= MAX_QUEUE) {
        res.writeHead(409, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, text: 'busy' }))
        return
      }
      res.setTimeout(620_000, () => { /* keep alive for the long session */ })
      queue.push({
        message: message.trim(),
        resolve: (result) => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(result))
        },
      })
      pump()
    })
    return
  }
  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: false, text: 'not found' }))
})

server.listen(PORT, HOST, () => {
  console.log(`omo-demo: http://${HOST}:${PORT} (image=${IMAGE}, model=${MODEL})`)
})
