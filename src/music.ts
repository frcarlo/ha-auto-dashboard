// The music page: which players it offers, and the small helpers for Music Assistant's media items.
// Everything goes through Home Assistant: the Music Assistant integration's services for the library,
// search and playback, media_player for control and grouping. No server of our own, as HArmony has.
import { allEntities, entityAreaId, type Hide } from './model'
import { domainOf, entityName } from './presentation'
import type { HassEntity, HomeAssistant } from './types'

export interface MusicPlayer {
  entity: string
  name: string
  area?: string
  /** A Music Assistant player: it plays from the library and can be grouped */
  ma?: boolean
  /** A Spotify account (Spotify integration): controls only */
  spotify?: boolean
}

/** A Music Assistant media item, as its services return them, or a browse node turned into one */
export interface MediaItem {
  uri: string
  name: string
  media_type: string
  image?: string | null
  artists?: { name: string }[]
  album?: { name: string } | null
  favorite?: boolean
  duration?: number
  /** Can be opened (album, playlist, artist); otherwise only played */
  expand?: boolean
  /** The content type to browse it with, as the media browser gave it */
  browse_type?: string
}

/** A Spotify account as HA's Spotify integration offers it through a Sonos or Cast speaker's media browser */
export interface SpotifyAccount {
  /** The account's root in the browser: spotify://<config entry id> */
  id: string
  name: string
}

/** The parts of a Spotify library shown on Home, in HArmony's order: recently played first */
export const SPOTIFY_SECTIONS = [
  'current_user_recently_played', 'current_user_playlists', 'current_user_followed_artists', 'current_user_saved_albums',
  'current_user_saved_tracks', 'current_user_top_artists', 'current_user_top_tracks',
] as const
export type SpotifySection = (typeof SPOTIFY_SECTIONS)[number]

/** Players whose media browser lists the Spotify accounts, whether or not anything plays on them */
export const SPOTIFY_BROWSER_PLATFORMS = ['sonos', 'cast']

/** Speakers that can browse Spotify, reachable ones of the preferred platform first */
export function findSpotifyBrowsers(hass: HomeAssistant): string[] {
  return Object.values(hass.entities)
    .filter(e => domainOf(e.entity_id) === 'media_player' && SPOTIFY_BROWSER_PLATFORMS.includes(e.platform ?? '') && hass.states[e.entity_id])
    .sort((a, b) => SPOTIFY_BROWSER_PLATFORMS.indexOf(a.platform!) - SPOTIFY_BROWSER_PLATFORMS.indexOf(b.platform!))
    .map(e => e.entity_id)
}

export const isSpotifyItem = (item: MediaItem) => item.uri.startsWith('spotify://')

/** What Music Assistant plays: spotify://<entry>/spotify:playlist:… becomes spotify:playlist:… */
export function playableUri(item: MediaItem): string {
  return /^spotify:\/\/[^/]+\/(spotify:.+)$/.exec(item.uri)?.[1] ?? item.uri
}

/** MediaPlayerEntityFeature.PLAY: a Music Assistant player keeps it in its features, also while unavailable */
const PLAY = 16384

/**
 * The second entity Music Assistant adds for Cast displays and TVs ("dashboard:…" in the registry), which only
 * shows a dashboard on the screen: no mass_player_type, cannot play, refuses MA's services. It is neither a speaker nor a TV.
 */
export const isMusicAssistantDashboard = (hass: HomeAssistant, entity: HassEntity) =>
  hass.entities[entity.entity_id]?.platform === 'music_assistant' && entity.attributes.mass_player_type === undefined &&
  ((Number(entity.attributes.supported_features) || 0) & PLAY) === 0

/** A Music Assistant player */
export const isMusicAssistant = (hass: HomeAssistant, entity: HassEntity) =>
  entity.attributes.mass_player_type !== undefined ||
  (hass.entities[entity.entity_id]?.platform === 'music_assistant' && !isMusicAssistantDashboard(hass, entity))

const isSpotify = (hass: HomeAssistant, entity: HassEntity) => hass.entities[entity.entity_id]?.platform === 'spotify'

/**
 * Music Assistant's players and the Spotify accounts, by name. Other media players (TVs, the cast and Sonos
 * entities Music Assistant already wraps) stay on their room pages. Players with the same name ("Lautsprecher")
 * get their room in front, so they can be told apart.
 */
export function findMusicPlayers(hass: HomeAssistant, hide: Hide = {}): MusicPlayer[] {
  const players = allEntities(hass, hide)
    .filter(e => domainOf(e.entity_id) === 'media_player' && (isMusicAssistant(hass, e) || isSpotify(hass, e)))
    .map((e): MusicPlayer => {
      const area = hass.areas[entityAreaId(hass, e.entity_id) ?? '']?.name
      return {
        entity: e.entity_id, name: entityName(e).trim(), ...(area ? { area } : {}),
        ...(isMusicAssistant(hass, e) ? { ma: true } : { spotify: true }),
      }
    })
  const count = new Map<string, number>()
  for (const p of players) count.set(p.name.toLowerCase(), (count.get(p.name.toLowerCase()) ?? 0) + 1)
  return players
    .map(p => (count.get(p.name.toLowerCase())! > 1 && p.area && !p.name.toLowerCase().includes(p.area.toLowerCase())
      ? { ...p, name: `${p.area} ${p.name}` } : p))
    .sort((a, b) => Number(!!a.spotify) - Number(!!b.spotify) || a.name.localeCompare(b.name))
}

const EXPANDABLE = ['album', 'playlist', 'artist', 'podcast', 'audiobook', 'folder']

/**
 * A child of media_player/browse_media as a media item. Music Assistant names tracks "Artist - Title"
 * when browsing a playlist, so the artist is split off again.
 */
export function browseToItem(node: { title: string; media_content_id: string; media_class?: string; media_content_type?: string; thumbnail?: string | null; can_expand?: boolean }): MediaItem {
  const type = node.media_class === 'directory' ? 'folder' : node.media_class ?? node.media_content_type ?? 'track'
  let name = node.title
  let artists: { name: string }[] | undefined
  // Music Assistant writes "Artist - Title"; Spotify's own titles stay whole
  const split = type === 'track' && !node.media_content_id.startsWith('spotify://') ? / - /.exec(name) : null
  if (split) {
    artists = [{ name: name.slice(0, split.index) }]
    name = name.slice(split.index + 3)
  }
  return {
    uri: node.media_content_id, name, media_type: type, image: node.thumbnail ?? null,
    ...(artists ? { artists } : {}), ...(node.can_expand || EXPANDABLE.includes(type) ? { expand: true } : {}),
    ...(node.media_content_type ? { browse_type: node.media_content_type } : {}),
  }
}

export const canOpenItem = (item: MediaItem) => item.expand ?? EXPANDABLE.includes(item.media_type)

/** The line under a title: the artists, else the album */
export function itemSub(item: MediaItem): string {
  const artists = (item.artists ?? []).map(a => a.name).filter(Boolean).join(', ')
  return artists || item.album?.name || ''
}

/** 3:07, or 1:02:07 past an hour */
export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}

/** Where the player is in the track now: HA only reports the position when it changes, so a playing one runs on */
export function mediaPosition(entity: HassEntity | undefined, now = Date.now()): number {
  const a = entity?.attributes
  if (!a || a.media_position === undefined) return 0
  let position = Number(a.media_position) || 0
  if (entity!.state === 'playing' && a.media_position_updated_at) {
    position += Math.max(0, (now - Date.parse(a.media_position_updated_at)) / 1000)
  }
  const duration = Number(a.media_duration) || 0
  return duration ? Math.min(position, duration) : position
}

/** The picture of what a player plays: HA's proxy first, Music Assistant's own address may not be reachable */
export const playerPicture = (entity: HassEntity | undefined): string | undefined =>
  (entity?.attributes.entity_picture_local ?? entity?.attributes.entity_picture) as string | undefined

/** Whether a player plays this item right now (a station, a track, a playlist it was started from) */
export const playsItem = (entity: HassEntity | undefined, item: MediaItem) =>
  !!entity && ['playing', 'paused', 'buffering'].includes(entity.state) &&
  (entity.attributes.media_content_id === item.uri || entity.attributes.media_content_id === playableUri(item) ||
    (item.media_type === 'radio' && entity.attributes.media_title === item.name))

/** Players grouped with this one, without itself */
export const groupMembers = (entity: HassEntity | undefined): string[] =>
  ((entity?.attributes.group_members ?? []) as string[]).filter(id => id !== entity?.entity_id)

// ── Lyrics ─────────────────────────────────────────────────

/** A line of synced lyrics, from where it starts in the track */
export interface LyricLine {
  time: number
  text: string
}

export interface Lyrics {
  synced?: LyricLine[]
  plain?: string
}

/** LRC as lrclib sends it: "[01:02.34] text", one or more stamps per line; empty lines are breaks, not lines */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    if (!text) continue
    for (const m of stamps) {
      const fraction = m[3] ? Number(m[3]) / 10 ** m[3].length : 0
      lines.push({ time: Number(m[1]) * 60 + Number(m[2]) + fraction, text })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

/** The line sung at this position, -1 before the first */
export function currentLine(lines: LyricLine[], position: number): number {
  let index = -1
  for (let i = 0; i < lines.length && lines[i]!.time <= position + 0.2; i++) index = i
  return index
}

/** The title as lyric sites know it: without "- Remastered 2011", "(feat. …)", "[Live]" */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s+-\s+.*\b(remaster(ed)?|live|version|edit|mix|mono|stereo|bonus|deluxe|single)\b.*$/i, '')
    .replace(/\s*[([](feat\.?|ft\.?|with|remaster(ed)?|live|radio edit|single version|album version|explicit)[^)\]]*[)\]]/gi, '')
    .trim() || title
}

/** The first artist, as lyric sites list it */
const firstArtist = (artist: string) => artist.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|\/)\s*/i)[0]!.trim() || artist

const LRCLIB = 'https://lrclib.net/api'
const lyricsCache = new Map<string, Promise<Lyrics | null>>()

type LrclibTrack = { syncedLyrics?: string | null; plainLyrics?: string | null; instrumental?: boolean }

const toLyrics = (data: LrclibTrack | null | undefined): Lyrics | null => {
  if (!data) return null
  const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : []
  if (synced.length) return { synced }
  return data.plainLyrics?.trim() ? { plain: data.plainLyrics.trim() } : null
}

/**
 * Lyrics from LRCLIB, which HArmony uses as well: the exact track first (with the length, when known), then a
 * search with the cleaned-up title. Straight from the browser, LRCLIB allows that. Once per track and page load.
 */
export function fetchLyrics(title: string, artist: string, album?: string, duration?: number, get: typeof fetch = fetch): Promise<Lyrics | null> {
  const key = `${artist}\n${title}`.toLowerCase()
  const cached = lyricsCache.get(key)
  if (cached) return cached
  const headers = { 'Lrclib-Client': 'Auto Dashboard (https://github.com/frcarlo/ha-auto-dashboard)' }
  const ask = async <T>(path: string, params: Record<string, string | undefined>): Promise<T | null> => {
    const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]))
    const res = await get(`${LRCLIB}/${path}?${query}`, { headers })
    return res.ok ? await res.json() as T : null
  }
  const track = cleanTitle(title)
  const lead = firstArtist(artist)
  const result = (async () => {
    const exact = await ask<LrclibTrack>('get', {
      track_name: title, artist_name: artist, album_name: album, duration: duration ? String(Math.round(duration)) : undefined,
    }).catch(() => null)
    const found = toLyrics(exact)
    if (found) return found
    const list = await ask<(LrclibTrack & { duration?: number })[]>('search', { track_name: track, artist_name: lead }) ?? []
    // Closest in length first, and synced lyrics over plain ones
    const ranked = list
      .filter(r => !r.instrumental && (r.syncedLyrics || r.plainLyrics))
      .sort((a, b) => Number(!a.syncedLyrics) - Number(!b.syncedLyrics) ||
        (duration ? Math.abs((a.duration ?? 0) - duration) - Math.abs((b.duration ?? 0) - duration) : 0))
    return toLyrics(ranked[0])
  })()
  // A failed request is tried again next time, a track without lyrics is not
  lyricsCache.set(key, result.catch(() => { lyricsCache.delete(key); return null }))
  return lyricsCache.get(key)!
}
