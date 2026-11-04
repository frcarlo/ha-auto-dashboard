// Registers the bundle as an inline (data: URL) dashboard resource over HA's WebSocket API.
// No file access to /config needed. Reads HA_URL and HA_TOKEN from this project's .env.
import { readFileSync } from 'node:fs'

const MARKER = '/*auto-dashboard*/'
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => l.split(/=(.*)/s).slice(0, 2).map(s => s.trim().replace(/^["']|["']$/g, ''))))
const { HA_URL, HA_TOKEN } = env
if (!HA_URL || !HA_TOKEN) throw new Error('HA_URL/HA_TOKEN fehlen in .env')

const code = MARKER + readFileSync('dist/auto-dashboard.js', 'utf8')
const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`

const ws = new WebSocket(`${HA_URL.replace(/^http/, 'ws').replace(/\/$/, '')}/api/websocket`)
let id = 0
const pending = new Map()
const send = msg => new Promise((resolve, reject) => {
  const msgId = ++id
  pending.set(msgId, { resolve, reject })
  ws.send(JSON.stringify({ id: msgId, ...msg }))
})

ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data)
  if (msg.type === 'auth_required') return ws.send(JSON.stringify({ type: 'auth', access_token: HA_TOKEN }))
  if (msg.type === 'auth_invalid') { console.error('Auth fehlgeschlagen'); process.exit(1) }
  if (msg.type === 'auth_ok') return run().catch(e => { console.error(e); process.exit(1) })
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  msg.success ? p.resolve(msg.result) : p.reject(new Error(JSON.stringify(msg.error)))
}

const PREFIX = 'data:text/javascript;base64,'
const isOurs = u => u.startsWith(PREFIX) &&
  Buffer.from(u.slice(PREFIX.length, PREFIX.length + 64), 'base64').toString('utf8').startsWith(MARKER)

async function run() {
  const resources = await send({ type: 'lovelace/resources' })
  const existing = resources.find(r => isOurs(r.url))
  if (existing) {
    await send({ type: 'lovelace/resources/update', resource_id: existing.id, res_type: 'module', url })
    console.log(`Resource ${existing.id} aktualisiert (${(code.length / 1024).toFixed(1)} KB)`)
  } else {
    const created = await send({ type: 'lovelace/resources/create', res_type: 'module', url })
    console.log(`Resource ${created.id} angelegt (${(code.length / 1024).toFixed(1)} KB)`)
  }
  ws.close()
}
