// A direct line to the Music Assistant add-on, for what HA's integration doesn't hand out: the whole play
// queue, moving and removing its items. It goes through HA's Ingress like the add-on's own sidebar panel,
// so the browser needs no address or login of Music Assistant: HA opens an Ingress session for the signed-in
// user, and Music Assistant signs that user in on its side. Without the add-on (a server elsewhere, HA in
// Docker) there is no line, and the music page falls back to what the integration tells.
import type { HomeAssistant } from './types'

export interface MaImage {
  type?: string
  path?: string
  provider?: string
  remotely_accessible?: boolean
  proxy_id?: string
}

export interface MaQueueItem {
  queue_item_id: string
  name: string
  duration?: number | null
  image?: MaImage | null
  media_item?: {
    uri?: string
    name?: string
    media_type?: string
    artists?: { name: string }[]
    album?: { name?: string; image?: MaImage | null; metadata?: { images?: MaImage[] | null } } | null
    metadata?: { images?: MaImage[] | null }
  } | null
}

export interface MaQueue {
  queue_id: string
  current_index?: number | null
  items?: number
}

export interface MaDirect {
  /** The add-on's address behind Ingress, ending in a slash */
  base: string
  send<T>(command: string, args?: Record<string, unknown>): Promise<T>
  /** Called with each event Music Assistant sends, e.g. `queue_items_updated`; returns the way to stop */
  listen(callback: (event: string, objectId?: string) => void): () => void
}

/** How long a command may take before it counts as failed */
const TIMEOUT = 10_000
/** Supervisor ends an Ingress session that isn't renewed within 15 minutes */
const RENEW_EVERY = 5 * 60_000

let line: Promise<MaDirect | undefined> | undefined
let replaced: ((hass: HomeAssistant) => Promise<MaDirect | undefined>) | undefined

/** The development harness hands in a fake add-on */
export function fakeMaDirect(open: (hass: HomeAssistant) => Promise<MaDirect | undefined>) {
  replaced = open
  line = undefined
}

/** The Music Assistant add-on's slug, from its panel in the sidebar; only panels this user may open are listed */
export function maSlug(hass: HomeAssistant): string | undefined {
  return Object.values(hass.panels ?? {}).map(p => p.config?.addon ?? p.config?.ingress).find(s => !!s && /music_assistant/.test(s)) ?? undefined
}

/** The line to the add-on, opened once and shared; undefined when there is no add-on or it can't be reached */
export function maDirect(hass: HomeAssistant): Promise<MaDirect | undefined> {
  // The harness's fake add-on too only where the sidebar lists the add-on's panel
  line ??= (!maSlug(hass) ? Promise.resolve(undefined) : replaced ? replaced(hass) : open(hass)).catch(() => undefined).then(direct => {
    // No line: try again next time, the add-on may just have been starting
    if (!direct) setTimeout(() => { line = undefined }, 60_000)
    return direct
  })
  return line
}

/** HA's newer Ingress commands, which also serve users who aren't admins; older HA has only the admin's */
async function ingress<T>(hass: HomeAssistant, modern: Record<string, unknown>, legacy: Record<string, unknown>): Promise<T> {
  try {
    return await hass.callWS!<T>(modern)
  } catch {
    return await hass.callWS!<T>({ type: 'supervisor/api', ...legacy })
  }
}

async function open(hass: HomeAssistant): Promise<MaDirect | undefined> {
  const slug = maSlug(hass)
  if (!slug || !hass.callWS || typeof WebSocket === 'undefined') return undefined
  const info = await ingress<{ ingress_url?: string }>(hass, { type: 'supervisor/ingress/info', slug }, { endpoint: `/addons/${slug}/info`, method: 'get' })
  const base = info?.ingress_url
  if (!base) return undefined
  let session = ''
  const renew = async () => {
    const r = await ingress<{ session?: string }>(hass, { type: 'supervisor/ingress/session', slug }, { endpoint: '/ingress/session', method: 'post' })
    if (!r?.session) throw new Error('no session')
    session = r.session
    // The same cookie HA's own add-on panels set
    document.cookie = `ingress_session=${session};path=/api/hassio_ingress/;SameSite=Strict${location.protocol === 'https:' ? ';Secure' : ''}`
  }
  await renew()

  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${base}ws`)
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; parts: unknown[]; timer: number }>()
  const listeners = new Set<(event: string, objectId?: string) => void>()
  let next = 1
  let timer: number | undefined
  const close = () => {
    window.clearInterval(timer)
    for (const p of pending.values()) { window.clearTimeout(p.timer); p.reject(new Error('closed')) }
    pending.clear()
    line = undefined
  }

  // The server greets with its info first; only then does it take commands
  await new Promise<void>((resolve, reject) => {
    const fail = () => reject(new Error('no connection'))
    const wait = window.setTimeout(() => { ws.close(); fail() }, TIMEOUT)
    ws.addEventListener('error', fail, { once: true })
    ws.addEventListener('message', () => { window.clearTimeout(wait); resolve() }, { once: true })
  })
  ws.addEventListener('close', close)
  ws.addEventListener('message', e => {
    let msg: Record<string, any>
    try { msg = JSON.parse(String(e.data)) } catch { return }
    if (msg.event) {
      for (const l of listeners) l(msg.event, msg.object_id)
      return
    }
    const p = msg.message_id !== undefined ? pending.get(String(msg.message_id)) : undefined
    if (!p) return
    if (msg.error_code !== undefined) {
      pending.delete(String(msg.message_id))
      window.clearTimeout(p.timer)
      p.reject(new Error(msg.details ?? `error ${msg.error_code}`))
    } else if (msg.partial) {
      p.parts.push(...(msg.result ?? []))
    } else {
      pending.delete(String(msg.message_id))
      window.clearTimeout(p.timer)
      p.resolve(p.parts.length ? [...p.parts, ...(msg.result ?? [])] : msg.result)
    }
  })
  timer = window.setInterval(() => {
    ingress(hass, { type: 'supervisor/ingress/validate_session', session }, { endpoint: '/ingress/validate_session', method: 'post', data: { session } })
      .catch(() => renew().catch(() => undefined))
  }, RENEW_EVERY)

  return {
    base,
    send<T>(command: string, args: Record<string, unknown> = {}) {
      if (ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('closed'))
      const message_id = String(next++)
      return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => { pending.delete(message_id); reject(new Error('timeout')) }, TIMEOUT)
        pending.set(message_id, { resolve: resolve as (v: unknown) => void, reject, parts: [], timer })
        ws.send(JSON.stringify({ message_id, command, args }))
      })
    },
    listen(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }
}

/** A queue item's picture: the add-on's resized copy where it has one, else the picture itself if a browser may load it */
export function maImageUrl(base: string, item: MaQueueItem): string | undefined {
  const m = item.media_item
  const candidates = [item.image, m?.album?.image, ...(m?.album?.metadata?.images ?? []), ...(m?.metadata?.images ?? [])]
    .filter((i): i is MaImage => !!i && (!i.type || i.type === 'thumb'))
  for (const img of candidates) {
    if (img.proxy_id) return `${base}imageproxy/${img.proxy_id}?size=160`
    if (img.path?.startsWith('data:image')) return img.path
    if (img.remotely_accessible && img.path?.startsWith('http')) return img.path
  }
  return undefined
}
