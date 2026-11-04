// Copies the bundle to Home Assistant's /config/www and prints the resource URL.
// HA_WWW_TARGET is a local path (e.g. a Samba mount) or an scp target (user@host:/config/www/...).
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const env = existsSync('.env')
  ? Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => l.split(/=(.*)/s).slice(0, 2).map(s => s.trim())))
  : {}
const target = process.env.HA_WWW_TARGET ?? env.HA_WWW_TARGET
if (!target) {
  console.error('HA_WWW_TARGET fehlt (.env oder Umgebung), siehe .env.example')
  process.exit(1)
}

const file = 'dist/auto-dashboard.js'
const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8)

if (/^[^/]+:/.test(target)) {
  execFileSync('scp', [file, `${target.replace(/\/$/, '')}/auto-dashboard.js`], { stdio: 'inherit' })
} else {
  mkdirSync(target, { recursive: true })
  copyFileSync(file, join(target, 'auto-dashboard.js'))
}

console.log(`Kopiert nach ${target}`)
console.log(`Resource-URL (Typ module): /local/auto-dashboard/auto-dashboard.js?v=${hash}`)
