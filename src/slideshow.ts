// The photo face's slideshow: the pictures of a folder in HA's media (an Immich album, a local folder), one after
// another. HA lists them through media_source/browse_media and hands out a signed URL for each.
import type { HomeAssistant } from './types'

/** One entry of HA's media browser */
export interface MediaNode {
  title: string
  media_content_id: string
  media_class?: string
  media_content_type?: string
  can_expand?: boolean
  thumbnail?: string | null
  children?: MediaNode[]
}

export function isPicture(node: MediaNode) {
  return node.media_class === 'image' || String(node.media_content_type ?? '').startsWith('image/')
}

/**
 * The pictures of a folder, without videos and subfolders. A photo kept as RAW and JPEG comes twice in a row with
 * the same name; the second one is dropped so the same picture does not show twice.
 */
export function albumPictures(folder?: MediaNode): MediaNode[] {
  const out: MediaNode[] = []
  for (const node of folder?.children ?? []) {
    if (!isPicture(node)) continue
    if (node.title && out[out.length - 1]?.title === node.title) continue
    out.push(node)
  }
  return out
}

/** The order to show `count` pictures in: as they come, or shuffled (Fisher–Yates) */
export function playOrder(count: number, shuffle: boolean, random: () => number = Math.random): number[] {
  const order = Array.from({ length: count }, (_, i) => i)
  if (!shuffle) return order
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}

/** A folder of HA's media; without an id the top level with all sources (Immich, local media, …) */
export function browseMedia(hass: HomeAssistant, id?: string) {
  return hass.callWS!<MediaNode>({ type: 'media_source/browse_media', ...(id ? { media_content_id: id } : {}) })
}

/** Thumbnails from HA's own API (Immich's /immich/…) need a signed path, like HA's media browser does it */
export async function thumbnailUrl(hass: HomeAssistant, thumbnail: string) {
  if (!thumbnail.startsWith('/')) return thumbnail
  const signed = await hass.callWS!<{ path: string }>({ type: 'auth/sign_path', path: thumbnail, expires: 3600 })
  return signed.path
}

/** A signed URL for one picture, good for a day */
export async function pictureUrl(hass: HomeAssistant, id: string) {
  const resolved = await hass.callWS!<{ url: string }>({ type: 'media_source/resolve_media', media_content_id: id, expires: 24 * 3600 })
  return resolved.url
}
