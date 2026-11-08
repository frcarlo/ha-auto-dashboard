// The music page, after HArmony's: a side with Home, Search, Radio, Speakers and the playlists of the library,
// the chosen view in the middle and a player bar along the bottom. The library, search and playback come from
// Music Assistant through Home Assistant; Spotify accounts can be controlled, but not browsed.
import { css, html, nothing, type TemplateResult } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { t, type Key } from '../i18n'
import {
  SPOTIFY_SECTIONS, browseToItem, canOpenItem, formatTime, groupMembers, isSpotifyItem, itemSub, mediaPosition, playableUri, playerPicture, playsItem,
  type MediaItem, type MusicPlayer, type SpotifyAccount, type SpotifySection,
} from '../music'
import { tokens } from '../styles/tokens'
import type { HassEntity, NavPosition } from '../types'

interface MusicCardConfig extends BaseConfig {
  players: MusicPlayer[]
  /** Where the nav bar floats, so the player bar stays clear of it */
  nav_position?: NavPosition
  /** Sonos or Cast speakers whose media browser lists the Spotify accounts */
  spotify_browsers?: string[]
}

type BrowseNode = Parameters<typeof browseToItem>[0] & { children?: Parameters<typeof browseToItem>[0][] }

/** One part of a Spotify library on Home: its folder (for "show all") and the first items */
interface Shelf {
  key: SpotifySection
  folder: MediaItem
  items: MediaItem[]
}

type View = 'home' | 'search' | 'radio' | 'players' | 'detail'
type Enqueue = 'play' | 'replace' | 'next' | 'add'

interface Library {
  playlists: MediaItem[]
  recent: MediaItem[]
  artists: MediaItem[]
  tracks: MediaItem[]
  radio: MediaItem[]
}

interface Detail {
  item: MediaItem
  children?: MediaItem[]
  loading?: boolean
  failed?: boolean
}

interface QueueInfo {
  items?: number
  current_item?: { name?: string; media_item?: MediaItem } | null
  next_item?: { name?: string; media_item?: MediaItem } | null
}

type SearchResults = Partial<Record<'tracks' | 'artists' | 'albums' | 'playlists' | 'radio', MediaItem[]>>

// media_player supported_features bits
const F = { PAUSE: 1, SEEK: 2, VOLUME_SET: 4, VOLUME_MUTE: 8, PREVIOUS: 16, NEXT: 32, PLAY: 16384, SHUFFLE: 32768, REPEAT: 262144, GROUPING: 524288 }

const PLAYER_KEY = 'ad-music-player'
const ACCOUNT_KEY = 'ad-music-spotify'
/** Music Assistant takes this many tracks at once when a Spotify list is played track by track */
const MAX_TRACKS = 100
const TYPES = ['playlist', 'album', 'artist', 'track', 'radio', 'podcast', 'audiobook', 'folder']
/** The library is read again after this long, when the page is shown */
const LIBRARY_EVERY = 10 * 60_000

/** One Music Assistant config entry per HA; found once, through the registry entry of one of its players */
let entryId: Promise<string | undefined> | undefined
let library: { at: number; data: Library } | undefined
/** The Spotify accounts and the speaker that lists them, found once */
let spotifyRoot: Promise<{ browser?: string; accounts: SpotifyAccount[] }> | undefined
const shelfCache = new Map<string, { at: number; shelves: Shelf[] }>()

function readSaved(key = PLAYER_KEY) {
  try { return localStorage.getItem(key) ?? undefined } catch { return undefined }
}

const eq = html`<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`

export class AdMusic extends BaseCard<MusicCardConfig> {
  static properties = {
    ...BaseCard.properties,
    view: { state: true },
    selected: { state: true },
    lib: { state: true },
    libLoading: { state: true },
    libFailed: { state: true },
    detail: { state: true },
    query: { state: true },
    results: { state: true },
    searching: { state: true },
    searchFailed: { state: true },
    busy: { state: true },
    menu: { state: true },
    panel: { state: true },
    queue: { state: true },
    now: { state: true },
    message: { state: true },
    accounts: { state: true },
    account: { state: true },
    shelves: { state: true },
  }

  view: View = 'home'
  selected?: string = readSaved()
  lib?: Library = library?.data
  libLoading = false
  libFailed = false
  detail?: Detail
  /** Where Detail was opened from, for the back button */
  private from: View = 'home'
  query = ''
  results?: SearchResults
  searching = false
  searchFailed = false
  /** The item being started, for a spinner on its button */
  busy?: string
  /** The track whose menu is open */
  menu?: string
  private menuUp = false
  panel?: 'queue' | 'transfer' | 'volume'
  queue?: QueueInfo
  now = Date.now()
  message?: string
  /** Spotify accounts offered for the library; the chosen one is remembered on this device */
  accounts?: SpotifyAccount[]
  account?: string = readSaved(ACCOUNT_KEY)
  shelves?: Shelf[]
  private spotifyBrowser?: string
  private spotifyLoading = false

  private timer?: number
  private queueFor = ''
  private messageTimer?: number
  private closeMenu = (e: Event) => {
    if (!e.composedPath().some(el => (el as HTMLElement).classList?.contains('menu-wrap'))) this.menu = undefined
    if (!e.composedPath().some(el => (el as HTMLElement).classList?.contains('panel-wrap'))) this.panel = undefined
  }

  static styles = [tokens, css`
    :host { display: block; container-type: inline-size; --bottom: 96px; }
    :host([nav=top]) { --bottom: 12px; }
    @media (min-width: 1024px) { :host([nav=left]), :host([nav=right]) { --bottom: 12px; } }

    .music { display: grid; grid-template-columns: 236px minmax(0, 1fr); grid-template-areas: 'side main' 'bar bar'; gap: 12px; align-items: start; }
    .side { grid-area: side; padding: 10px; position: sticky; top: calc(var(--header-height, 56px) + 12px); max-height: calc(100vh - var(--header-height, 56px) - var(--bottom) - 120px); display: flex; flex-direction: column; }
    .main { grid-area: main; min-height: 420px; padding: 18px 20px 24px; overflow: visible; }
    /* Frosted like the nav bar, since the page scrolls beneath it */
    .bar { grid-area: bar; position: sticky; bottom: var(--bottom); z-index: 2; overflow: visible;
      background: var(--ad-glass-bg); backdrop-filter: var(--ad-glass-blur); -webkit-backdrop-filter: var(--ad-glass-blur);
      box-shadow: 0 10px 36px rgba(0, 0, 0, 0.28), inset 0 0 0 1px rgba(var(--ad-on-surface), 0.08), inset 0 1px 0 var(--ad-glass-hi); }

    /* Side: the views, then the playlists */
    nav { display: flex; flex-direction: column; gap: 2px; }
    .nav {
      all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 14px; cursor: pointer;
      font-size: 14px; font-weight: 500; color: rgba(var(--ad-on-surface), 0.7);
    }
    .nav:hover { background: rgba(var(--ad-on-surface), 0.05); }
    .nav[aria-current=true] { color: rgb(var(--ad-primary)); background: rgba(var(--ad-primary), 0.12); }
    .nav:focus-visible, .tile:focus-visible, .row:focus-visible, .lib:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: -2px; }
    .lib-head { display: flex; align-items: center; gap: 8px; padding: 16px 12px 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.5; }
    .lib-head ha-icon { --mdc-icon-size: 15px; }
    .libs { overflow-y: auto; min-height: 0; flex: 1; scrollbar-width: thin; }
    .lib { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 12px; cursor: pointer; }
    .lib:hover { background: rgba(var(--ad-on-surface), 0.05); }
    .lib[aria-current=true] { background: rgba(var(--ad-primary), 0.12); }
    .lib .art { width: 38px; height: 38px; flex: 0 0 38px; border-radius: 9px; }
    .lib-text { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .lib-text span { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lib-text small { display: flex; align-items: center; gap: 4px; font-size: 11px; opacity: 0.5; }
    .lib-text small ha-icon { --mdc-icon-size: 11px; }
    .home-head { display: flex; justify-content: flex-end; margin: -4px 0 14px; }
    .chip.spotify { padding: 6px 12px; font-size: 13px; }
    .chip.spotify ha-icon:first-child { color: #1db954; --mdc-icon-size: 16px; }
    .pill.small { height: 30px; padding: 0 12px; font-size: 12px; }

    /* Artwork with an icon until the picture loads, and when it doesn't */
    .art { position: relative; overflow: hidden; display: grid; place-items: center; background: rgba(var(--ad-on-surface), 0.08); color: rgba(var(--ad-on-surface), 0.35); }
    .art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .art.round, .tile .art.round, .hero .art.round { border-radius: 50%; }

    /* Main */
    .glow-wrap { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; pointer-events: none; z-index: -1; }
    .glow { position: absolute; inset: 0 0 auto 0; height: 280px; background: center / cover; filter: blur(60px) saturate(160%); opacity: 0.32;
      -webkit-mask-image: linear-gradient(#000, transparent); mask-image: linear-gradient(#000, transparent); }
    h2 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
    .section { margin-top: 26px; }
    .section:first-child { margin-top: 0; }
    .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .section-head h3 { margin: 0; font-size: 17px; font-weight: 600; }
    .placeholder { padding: 48px 16px; text-align: center; opacity: 0.55; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .placeholder ha-icon { --mdc-icon-size: 48px; opacity: 0.5; }
    .hint { margin: 0 0 16px; padding: 10px 14px; border-radius: 14px; font-size: 13px; background: rgba(var(--ad-info), 0.12); }
    .spinner { width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid rgba(var(--ad-primary), 0.25); border-top-color: rgb(var(--ad-primary)); animation: spin 0.8s linear infinite; }
    .spinner.small { width: 14px; height: 14px; border-width: 2px; }
    .center { display: grid; place-items: center; padding: 40px 0; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Quick grid: the playlists played last, as on HArmony's home */
    .quick { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 8px; }
    .quick-item { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 12px; height: 56px; padding-right: 10px; border-radius: 12px; overflow: hidden; cursor: pointer; background: rgba(var(--ad-on-surface), 0.06); }
    .quick-item:hover { background: rgba(var(--ad-on-surface), 0.1); }
    .quick-item .art { width: 56px; height: 56px; flex: 0 0 56px; }
    .quick-item span { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .quick-item { position: relative; }
    .quick-item .play { position: absolute; right: 8px; top: 8px; opacity: 0; transition: opacity 0.15s; }
    .quick-item:hover .play, .quick-item:focus-within .play { opacity: 1; }

    /* A row of covers */
    /* Padding makes room for the tiles' hover surface, which reaches past them */
    .tiles { display: grid; grid-auto-flow: column; grid-auto-columns: 148px; gap: 14px; overflow-x: auto; overflow-y: hidden; padding: 8px; margin: -8px; scrollbar-width: thin; scroll-snap-type: x proximity; }
    .tiles.wrap { grid-auto-flow: row; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); overflow: visible; }
    .tile { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; padding: 8px; margin: -8px; border-radius: 16px; cursor: pointer; scroll-snap-align: start; min-width: 0; }
    .tile:hover { background: rgba(var(--ad-on-surface), 0.05); }
    .tile .art { aspect-ratio: 1; width: 100%; border-radius: 12px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18); }
    .tile .art ha-icon { --mdc-icon-size: 32px; }
    .tile .t { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tile .s { font-size: 12px; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: -4px; }
    .tile .play { position: absolute; right: 8px; bottom: 8px; opacity: 0; transform: translateY(4px); transition: opacity 0.15s, transform 0.15s; }
    .tile:hover .play, .tile:focus-within .play, .tile .play.busy { opacity: 1; transform: none; }
    .tile.on .art { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; }
    .badge { position: absolute; left: 8px; top: 8px; display: flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; background: rgb(var(--ad-error)); color: #fff; }
    .badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #fff; animation: pulse 1.4s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: 0.3; } }

    /* The round play button on covers and in headers */
    .play { all: unset; box-sizing: border-box; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; flex: none;
      background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3); }
    .play.big { width: 56px; height: 56px; }
    .play.big ha-icon { --mdc-icon-size: 28px; }
    .play[disabled] { opacity: 0.35; pointer-events: none; }
    .play:focus-visible { outline: 2px solid rgb(var(--ad-primary)); outline-offset: 2px; opacity: 1; }
    .play .spinner { border-color: rgba(var(--ad-on-primary), 0.3); border-top-color: rgb(var(--ad-on-primary)); }

    /* Track rows */
    .rows { display: flex; flex-direction: column; }
    .row { display: grid; grid-template-columns: 28px 40px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 6px 8px; border-radius: 12px; cursor: pointer; position: relative; }
    .row:hover { background: rgba(var(--ad-on-surface), 0.05); }
    .row .n { text-align: center; font-size: 13px; opacity: 0.5; font-variant-numeric: tabular-nums; display: grid; place-items: center; }
    .row .art { width: 40px; height: 40px; border-radius: 8px; }
    .row .art ha-icon { --mdc-icon-size: 16px; }
    .row .t { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row .s { font-size: 12px; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row.on .t { color: rgb(var(--ad-primary)); font-weight: 600; }
    .row .dur { font-size: 12px; opacity: 0.5; font-variant-numeric: tabular-nums; }
    .icon-btn { all: unset; box-sizing: border-box; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; color: rgba(var(--ad-on-surface), 0.6); }
    .icon-btn:hover { background: rgba(var(--ad-on-surface), 0.08); }
    .icon-btn:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .icon-btn ha-icon { --mdc-icon-size: 18px; }

    /* Small menus: track actions, queue, other speakers */
    .menu-wrap, .panel-wrap { position: relative; }
    .menu, .pop {
      position: absolute; z-index: 4; right: 0; top: calc(100% + 4px); min-width: 210px; padding: 6px; border-radius: 16px;
      background: var(--ad-surface); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(var(--ad-on-surface), 0.08);
    }
    .menu.up { top: auto; bottom: calc(100% + 4px); }
    .pop { top: auto; bottom: calc(100% + 10px); min-width: 280px; max-width: min(360px, calc(100vw - 32px)); max-height: 60vh; overflow-y: auto; }
    .menu button, .pop .item {
      all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 10px; cursor: pointer; font-size: 13px;
    }
    .menu button:hover, .pop .item:hover { background: rgba(var(--ad-on-surface), 0.07); }
    .menu button:focus-visible, .pop .item:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .menu ha-icon, .pop .item ha-icon { --mdc-icon-size: 18px; opacity: 0.7; }
    .pop-head { padding: 8px 12px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.5; }
    .pop .q { display: flex; align-items: center; gap: 12px; padding: 6px 12px; }
    .pop .q .art { width: 40px; height: 40px; flex: 0 0 40px; border-radius: 8px; }
    .pop .q .text { min-width: 0; flex: 1; }
    .pop .q .t { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pop .q .s { font-size: 12px; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pop .note { padding: 6px 12px 10px; font-size: 12px; opacity: 0.55; }

    /* Detail: a playlist, album or artist */
    .back { all: unset; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; opacity: 0.7; cursor: pointer; margin-bottom: 14px; padding: 4px 8px 4px 4px; border-radius: 999px; }
    .back:hover { opacity: 1; background: rgba(var(--ad-on-surface), 0.06); }
    .hero { display: flex; align-items: flex-end; gap: 22px; margin-bottom: 20px; }
    .hero .art { width: 168px; height: 168px; flex: 0 0 168px; border-radius: 16px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35); }
    .hero .art ha-icon { --mdc-icon-size: 56px; }
    .hero .type { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.6; }
    .hero h1 { margin: 6px 0 8px; font-size: clamp(24px, 4cqw, 40px); line-height: 1.1; font-weight: 700; letter-spacing: -0.02em; }
    .hero .meta { font-size: 13px; opacity: 0.6; }
    .actions { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }

    /* Search */
    .search { display: flex; gap: 8px; margin-bottom: 22px; }
    .search label { flex: 1; display: flex; align-items: center; gap: 10px; padding: 0 14px; height: 46px; border-radius: 999px; background: rgba(var(--ad-on-surface), 0.07); }
    .search label:focus-within { outline: 2px solid rgb(var(--ad-primary)); }
    .search input { all: unset; flex: 1; min-width: 0; font-size: 15px; }
    .search input::placeholder { color: rgba(var(--ad-on-surface), 0.45); }
    .pill { all: unset; box-sizing: border-box; padding: 0 18px; height: 46px; border-radius: 999px; display: inline-flex; align-items: center; cursor: pointer; font-weight: 600; font-size: 14px;
      background: rgb(var(--ad-primary)); color: rgb(var(--ad-on-primary)); }
    .pill[disabled] { opacity: 0.4; pointer-events: none; }
    .pill.quiet { height: 36px; background: rgba(var(--ad-on-surface), 0.08); color: inherit; }

    /* Speakers */
    .players { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); gap: 12px; }
    .player {
      position: relative; overflow: hidden; isolation: isolate; display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: 20px; cursor: pointer;
      background: rgba(var(--ad-on-surface), 0.05); box-shadow: inset 0 0 0 1px rgba(var(--ad-on-surface), 0.06);
    }
    .player:hover { background: rgba(var(--ad-on-surface), 0.08); }
    .player.selected { box-shadow: inset 0 0 0 2px rgb(var(--ad-primary)); }
    .player.off { opacity: 0.5; }
    .player .bg { position: absolute; inset: 0; z-index: -1; background: center / cover; filter: blur(24px) saturate(140%); opacity: 0.35; transform: scale(1.2); }
    .player .top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    .player .icon { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: rgba(var(--ad-on-surface), 0.08); }
    .player.playing .icon { background: rgba(var(--ad-primary), 0.18); color: rgb(var(--ad-primary)); }
    .player .icon.spotify { color: #1db954; }
    .player .name { font-size: 15px; font-weight: 600; opacity: 1; letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .player .area { font-size: 12px; opacity: 0.55; }
    .player .np { font-size: 12px; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 16px; }
    .player .foot { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .player .foot input { flex: 1; }
    .chip { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
      background: rgba(var(--ad-on-surface), 0.08); }
    .chip ha-icon { --mdc-icon-size: 14px; }
    .chip.on { background: rgba(var(--ad-primary), 0.16); color: rgb(var(--ad-primary)); }
    .chip:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .sub-head { display: flex; align-items: center; gap: 8px; margin: 22px 0 10px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.55; }
    .sub-head:first-child { margin-top: 0; }
    .sub-head ha-icon { --mdc-icon-size: 15px; }

    /* Moving bars for what plays */
    .eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
    .eq i { width: 3px; height: 100%; border-radius: 2px; background: rgb(var(--ad-primary)); animation: eq 0.9s ease-in-out infinite; transform-origin: bottom; }
    .eq i:nth-child(2) { animation-delay: -0.3s; } .eq i:nth-child(3) { animation-delay: -0.6s; } .eq i:nth-child(4) { animation-delay: -0.15s; }
    @keyframes eq { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
    @media (prefers-reduced-motion: reduce) { .eq i, .badge::before { animation: none; } .eq i { transform: scaleY(0.7); } }

    /* Player bar */
    .bar-in { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1fr); align-items: center; gap: 16px; padding: 10px 14px; }
    .track { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .track .art { width: 56px; height: 56px; flex: 0 0 56px; border-radius: 12px; }
    .track .text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .track .t { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .track .s { font-size: 12px; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .who { all: unset; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: rgb(var(--ad-primary)); cursor: pointer; max-width: 100%; }
    .who span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .who ha-icon { --mdc-icon-size: 13px; }
    .center-col { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
    .ctrls { display: flex; align-items: center; gap: 8px; }
    .ctrl { all: unset; box-sizing: border-box; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; color: rgba(var(--ad-on-surface), 0.75); }
    .ctrl:hover { background: rgba(var(--ad-on-surface), 0.08); color: rgb(var(--ad-on-surface)); }
    .ctrl:focus-visible { outline: 2px solid rgb(var(--ad-primary)); }
    .ctrl.small ha-icon { --mdc-icon-size: 18px; }
    .ctrl ha-icon { --mdc-icon-size: 24px; }
    .ctrl.on { color: rgb(var(--ad-primary)); }
    .ctrl.main { width: 42px; height: 42px; background: rgb(var(--ad-on-surface)); color: var(--ad-surface); }
    .ctrl[disabled] { opacity: 0.3; pointer-events: none; }
    .progress { display: flex; align-items: center; gap: 10px; width: 100%; font-size: 11px; opacity: 0.85; font-variant-numeric: tabular-nums; }
    .progress span { width: 40px; opacity: 0.6; }
    .progress span:first-child { text-align: right; }
    .progress input { flex: 1; }
    .right { display: flex; align-items: center; justify-content: flex-end; gap: 4px; min-width: 0; }
    .right .vol { width: 110px; }
    input[type=range] { accent-color: rgb(var(--ad-primary)); height: 4px; min-width: 0; cursor: pointer; margin: 0; }
    input[type=range][disabled] { opacity: 0.35; cursor: default; }
    .message { position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%); padding: 8px 14px; border-radius: 999px; font-size: 12px; white-space: nowrap;
      background: rgb(var(--ad-on-surface)); color: var(--ad-surface); }

    /* Narrow cards: tabs instead of the side, the bar in two lines */
    @container (max-width: 760px) {
      .music { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'side' 'main' 'bar'; }
      .side { position: static; max-height: none; padding: 6px; }
      nav { flex-direction: row; overflow-x: auto; scrollbar-width: none; }
      .nav { flex: 1; justify-content: center; gap: 6px; padding: 8px 10px; font-size: 13px; white-space: nowrap; }
      .lib-head, .libs { display: none; }
      .main { padding: 14px 14px 20px; min-height: 0; }
      .hero { flex-direction: column; align-items: flex-start; gap: 14px; }
      .hero .art { width: 132px; height: 132px; flex-basis: 132px; }
      .bar-in { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'track right' 'center center'; gap: 6px 10px; padding: 8px 10px; }
      .track { grid-area: track; }
      .track .art { width: 46px; height: 46px; flex-basis: 46px; }
      .right { grid-area: right; }
      .right .vol, .right .vol-icon { display: none; }
      .center-col { grid-area: center; }
      .ctrls { gap: 4px; }
      .row { grid-template-columns: 24px 40px minmax(0, 1fr) auto; }
      .row .dur { display: none; }
      .quick { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .quick-item { height: 48px; gap: 10px; }
      .quick-item .art { width: 48px; height: 48px; flex-basis: 48px; }
      .quick-item .play { display: none; }
    }
    @container (min-width: 761px) { .vol-btn { display: none; } }
    /* Phones: the four tabs fit when only the open one says its name */
    @container (max-width: 480px) {
      .nav { flex: 0 0 auto; }
      .nav[aria-current=true] { flex: 1; }
      .nav:not([aria-current=true]) span { display: none; }
    }
  `]

  getCardSize() {
    return 10
  }

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  protected watched() {
    return (this.config?.players ?? []).map(p => p.entity)
  }

  connectedCallback() {
    super.connectedCallback()
    this.timer = window.setInterval(() => {
      if (this.player?.state === 'playing' && document.visibilityState !== 'hidden') this.now = Date.now()
    }, 1000)
    document.addEventListener('click', this.closeMenu)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.clearInterval(this.timer)
    window.clearTimeout(this.messageTimer)
    document.removeEventListener('click', this.closeMenu)
  }

  protected updated() {
    if (!this.hass || !this.config) return
    this.setAttribute('nav', this.config.nav_position ?? 'bottom')
    if (!this.libLoading && (!library || Date.now() - library.at > LIBRARY_EVERY) && !this.libFailed) void this.loadLibrary()
    if (!this.spotifyLoading && !this.shelves && this.config.spotify_browsers?.length) void this.loadSpotify()
    // The queue changes with the track; read it again when the panel is open and something new plays
    const p = this.player
    const key = `${p?.entity_id}|${p?.attributes.media_content_id}|${p?.state}`
    if (this.panel === 'queue' && key !== this.queueFor) {
      this.queueFor = key
      void this.loadQueue()
    }
  }

  // ── Players ──────────────────────────────────────────────

  private get players() {
    return this.config?.players ?? []
  }

  private get maPlayers() {
    return this.players.filter(p => p.ma)
  }

  private reachable(id: string) {
    const s = this.hass?.states[id]?.state
    return !!s && s !== 'unavailable'
  }

  /** The chosen player: picked here (and remembered on this device), else one that plays, else the first Music Assistant one */
  private get playerId(): string | undefined {
    const ids = this.players.map(p => p.entity)
    if (this.selected && ids.includes(this.selected) && this.reachable(this.selected)) return this.selected
    const playing = this.players.find(p => this.hass?.states[p.entity]?.state === 'playing' && p.ma)
      ?? this.players.find(p => this.hass?.states[p.entity]?.state === 'playing')
    return playing?.entity ?? this.maPlayers.find(p => this.reachable(p.entity))?.entity ?? this.players.find(p => this.reachable(p.entity))?.entity
  }

  private get player(): HassEntity | undefined {
    return this.state(this.playerId)
  }

  private get info(): MusicPlayer | undefined {
    return this.players.find(p => p.entity === this.playerId)
  }

  /** Music Assistant plays the library on its own players only */
  private get target(): string | undefined {
    return this.info?.ma ? this.info.entity : undefined
  }

  private select(id: string) {
    this.selected = id
    try { localStorage.setItem(PLAYER_KEY, id) } catch { /* private window */ }
    this.panel = undefined
  }

  private nameOf(id: string) {
    return this.players.find(p => p.entity === id)?.name ?? this.hass?.states[id]?.attributes.friendly_name ?? id
  }

  private features(entity = this.player) {
    return Number(entity?.attributes.supported_features ?? 0)
  }

  // ── Talking to Home Assistant ───────────────────────────

  private say(text: string) {
    this.message = text
    window.clearTimeout(this.messageTimer)
    this.messageTimer = window.setTimeout(() => { this.message = undefined }, 3500)
  }

  private async respond<T>(domain: string, service: string, data: Record<string, unknown>, entity?: string): Promise<T | undefined> {
    const result = await this.hass!.callWS!<{ response?: T }>({
      type: 'call_service', domain, service, service_data: data, ...(entity ? { target: { entity_id: entity } } : {}), return_response: true,
    })
    return result?.response
  }

  private entry(): Promise<string | undefined> {
    const hass = this.hass!
    const first = this.maPlayers[0]?.entity
    entryId ??= (async () => {
      if (first) {
        const reg = await hass.callWS!<{ config_entry_id?: string }>({ type: 'config/entity_registry/get', entity_id: first }).catch(() => undefined)
        if (reg?.config_entry_id) return reg.config_entry_id
      }
      const entries = await hass.callWS!<{ entry_id: string; state?: string }[]>({ type: 'config_entries/get', domain: 'music_assistant' }).catch(() => [])
      return (entries.find(e => e.state === 'loaded') ?? entries[0])?.entry_id
    })()
    return entryId.then(id => {
      if (!id) entryId = undefined
      return id
    })
  }

  private async loadLibrary() {
    if (!this.hass?.callWS || !this.maPlayers.length) return
    this.libLoading = true
    try {
      const config_entry_id = await this.entry()
      if (!config_entry_id) throw new Error('no entry')
      const get = (media_type: string, extra: Record<string, unknown> = {}) =>
        this.respond<{ items?: MediaItem[] }>('music_assistant', 'get_library', { config_entry_id, media_type, ...extra })
          .then(r => (r?.items ?? []).filter(i => i.name?.trim()))
      const [playlists, recentPlaylists, recentAlbums, artists, tracks, radio] = await Promise.all([
        get('playlist', { limit: 200, order_by: 'name' }),
        get('playlist', { limit: 8, order_by: 'last_played_desc' }),
        get('album', { limit: 12, order_by: 'last_played_desc' }),
        get('artist', { limit: 16, favorite: true, order_by: 'name' }),
        get('track', { limit: 10, favorite: true, order_by: 'last_played_desc' }),
        get('radio', { limit: 200, order_by: 'name' }),
      ])
      // Played last first, playlists and albums taking turns
      const recent: MediaItem[] = []
      for (let i = 0; i < Math.max(recentPlaylists.length, recentAlbums.length); i++) {
        if (recentAlbums[i]) recent.push(recentAlbums[i]!)
        if (recentPlaylists[i]) recent.push(recentPlaylists[i]!)
      }
      library = { at: Date.now(), data: { playlists, recent, artists, tracks, radio } }
      this.lib = library.data
      this.libFailed = false
    } catch {
      this.libFailed = true
    } finally {
      this.libLoading = false
    }
  }

  private get currentAccount(): SpotifyAccount | undefined {
    const saved = this.account?.toLowerCase()
    return this.accounts?.find(a => a.id.toLowerCase() === saved) ?? this.accounts?.[0]
  }

  private browse(entity: string, item: MediaItem) {
    return this.hass!.callWS!<BrowseNode>({
      type: 'media_player/browse_media', entity_id: entity, media_content_id: item.uri,
      media_content_type: isSpotifyItem(item) ? item.browse_type ?? item.media_type : item.media_type,
    })
  }

  /**
   * The Spotify accounts, from the first speaker whose browser lists them. HA's own Spotify players only browse
   * while something plays on them; Sonos and Cast list every account at any time. The accounts are named
   * after their Spotify player in HA (Spotify Jonathan → Jonathan), else after the Spotify user.
   */
  private async findAccounts(browsers: string[]) {
    const hass = this.hass!
    const order = [...browsers].sort((a, b) => Number(!this.reachable(a)) - Number(!this.reachable(b)))
    for (const browser of order) {
      const root = await hass.callWS!<BrowseNode>({ type: 'media_player/browse_media', entity_id: browser }).catch(() => undefined)
      const found = (root?.children ?? []).filter(c => c.media_content_type === 'spotify://library')
      if (!found.length) continue
      const names = new Map<string, string>()
      await Promise.all(this.players.filter(p => p.spotify).map(async p => {
        const reg = await hass.callWS!<{ config_entry_id?: string }>({ type: 'config/entity_registry/get', entity_id: p.entity }).catch(() => undefined)
        if (reg?.config_entry_id) names.set(`spotify://${reg.config_entry_id}`.toLowerCase(), p.name.replace(/^spotify\s+/i, '') || p.name)
      }))
      const accounts = found.map(c => ({ id: c.media_content_id, name: names.get(c.media_content_id.toLowerCase()) ?? c.title }))
      return { browser, accounts }
    }
    return { accounts: [] }
  }

  private async loadSpotify() {
    const browsers = this.config?.spotify_browsers ?? []
    if (!browsers.length || !this.hass?.callWS) return
    this.spotifyLoading = true
    try {
      const root = await (spotifyRoot ??= this.findAccounts(browsers))
      if (!root.accounts.length) spotifyRoot = undefined
      this.accounts = root.accounts
      this.spotifyBrowser = root.browser
      const account = this.currentAccount
      if (!account || !root.browser) return (this.shelves = [])
      const cached = shelfCache.get(account.id)
      if (cached && Date.now() - cached.at < LIBRARY_EVERY) return (this.shelves = cached.shelves)
      const shelves = await Promise.all(SPOTIFY_SECTIONS.map(async (key): Promise<Shelf> => {
        const folder: MediaItem = { uri: `${account.id}/${key}`, name: t(this.hass, `mu.sp.${key}`), media_type: 'folder', expand: true, browse_type: `spotify://${key}` }
        const node = await this.browse(root.browser!, folder).catch(() => undefined)
        return { key, folder, items: (node?.children ?? []).map(browseToItem).filter(i => i.name.trim()) }
      }))
      const kept = shelves.filter(shelf => shelf.items.length)
      shelfCache.set(account.id, { at: Date.now(), shelves: kept })
      // Another account picked meanwhile: its own load brings its shelves
      if (this.currentAccount?.id === account.id) this.shelves = kept
    } catch {
      this.shelves = []
    } finally {
      this.spotifyLoading = false
    }
  }

  private selectAccount(id: string) {
    this.menu = undefined
    if (id === this.currentAccount?.id) return
    this.account = id
    try { localStorage.setItem(ACCOUNT_KEY, id) } catch { /* private window */ }
    this.shelves = shelfCache.get(id)?.shelves
    if (!this.shelves) void this.loadSpotify()
  }

  private retryLibrary() {
    this.libFailed = false
    library = undefined
    void this.loadLibrary()
  }

  private async loadQueue() {
    const id = this.target
    if (!id || !this.hass?.callWS) return (this.queue = undefined)
    const r = await this.respond<Record<string, QueueInfo>>('music_assistant', 'get_queue', {}, id).catch(() => undefined)
    this.queue = r?.[id]
  }

  private async search() {
    const name = this.query.trim()
    if (!name) return
    this.searching = true
    this.searchFailed = false
    try {
      const config_entry_id = await this.entry()
      if (!config_entry_id) throw new Error('no entry')
      this.results = await this.respond<SearchResults>('music_assistant', 'search', {
        config_entry_id, name, media_type: ['track', 'artist', 'album', 'playlist', 'radio'], limit: 12,
      }) ?? {}
    } catch {
      this.results = undefined
      this.searchFailed = true
    } finally {
      this.searching = false
    }
  }

  /** A playlist, album or artist opened: its tracks (or albums) through Music Assistant's media browser */
  private async open(item: MediaItem) {
    if (this.view !== 'detail') this.from = this.view
    this.view = 'detail'
    this.menu = undefined
    this.detail = { item, loading: true }
    // Spotify through the speaker that lists the accounts, the rest through Music Assistant
    const browser = isSpotifyItem(item) ? this.spotifyBrowser : this.target ?? this.maPlayers.find(p => this.reachable(p.entity))?.entity
    try {
      if (!browser) throw new Error('no player')
      const node = await this.browse(browser, item)
      if (this.detail?.item !== item) return
      this.detail = { item: { ...item, image: item.image ?? node.thumbnail }, children: (node.children ?? []).map(browseToItem) }
    } catch {
      if (this.detail?.item === item) this.detail = { item, failed: true }
    }
    this.renderRoot.querySelector('.main')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  private async play(item: MediaItem, enqueue: Enqueue = 'replace', options: { radio?: boolean; start?: MediaItem } = {}) {
    const id = this.target
    this.menu = undefined
    if (!id) return this.say(t(this.hass, 'mu.not_ma'))
    if (!this.canControl(id)) return
    this.busy = (options.start ?? item).uri
    const data = (media: MediaItem) => ({ media_id: playableUri(media), media_type: media.media_type, enqueue, ...(options.radio ? { radio_mode: true } : {}) })
    try {
      if (isSpotifyItem(item) && ['playlist', 'album', 'folder'].includes(item.media_type) && !options.radio) {
        // A Spotify list plays as its tracks: Music Assistant's own Spotify login may not see another account's
        // private playlists, and lists like "Liked songs" have no address at all
        const tracks = (this.detail?.item.uri === item.uri && this.detail.children ? this.detail.children
          : (await this.browse(this.spotifyBrowser!, item)).children?.map(browseToItem) ?? []).filter(c => c.media_type === 'track')
        const from = Math.max(0, options.start ? tracks.findIndex(c => c.uri === options.start!.uri) : 0)
        const list = tracks.slice(from, from + MAX_TRACKS)
        if (!list.length) throw new Error(t(this.hass, 'mu.open_failed'))
        await this.call('music_assistant', 'play_media', id, { media_id: list.map(playableUri), media_type: 'track', enqueue })
      } else if (options.start) {
        // A track in a playlist or album: the whole list from that track on, as in HArmony; alone if that fails
        await this.call('music_assistant', 'play_media', id, { ...data(item), start_item: options.start.uri })
          ?.catch(() => this.call('music_assistant', 'play_media', id, data(options.start!)))
      } else await this.call('music_assistant', 'play_media', id, data(item))
      if (enqueue === 'next' || enqueue === 'add') this.say(`${options.start?.name ?? item.name} · ${t(this.hass, enqueue === 'next' ? 'mu.play_next' : 'mu.add')}`)
    } catch (e) {
      this.say((e as Error)?.message || t(this.hass, 'mu.error'))
    } finally {
      this.busy = undefined
    }
  }

  private async shuffle(item: MediaItem) {
    const id = this.target
    if (id && this.features() & F.SHUFFLE) await this.call('media_player', 'shuffle_set', id, { shuffle: true })
    await this.play(item)
  }

  private control(service: string, data: Record<string, unknown> = {}, id = this.playerId) {
    if (id) void this.call('media_player', service, id, data)
  }

  private transfer(to: string) {
    const from = this.target
    this.panel = undefined
    if (!from) return
    void this.call('music_assistant', 'transfer_queue', to, { source_player: from, auto_play: true })
    this.select(to)
  }

  private toggleGroup(id: string) {
    const lead = this.target
    if (!lead) return
    if (groupMembers(this.player).includes(id)) this.control('unjoin', {}, id)
    else void this.call('media_player', 'join', lead, { group_members: [id] })
  }

  // ── Pieces ───────────────────────────────────────────────

  private art(src: string | null | undefined, icon = 'mdi:music-note', round = false) {
    return html`<div class="art ${round ? 'round' : ''}"><ha-icon icon=${icon}></ha-icon>${src ? html`<img src=${src} alt="" loading="lazy"
      @error=${(e: Event) => (e.target as HTMLElement).remove()}>` : nothing}</div>`
  }

  private typeLabel(type: string) {
    return TYPES.includes(type) ? t(this.hass, `mu.type.${type}` as Key) : ''
  }

  private iconFor(item: MediaItem) {
    return { radio: 'mdi:radio', artist: 'mdi:account-music', album: 'mdi:album', playlist: 'mdi:playlist-music', podcast: 'mdi:podcast', audiobook: 'mdi:book-music', folder: 'mdi:folder-music' }[item.media_type] ?? 'mdi:music-note'
  }

  private playButton(item: MediaItem, big = false, run = () => this.play(item)) {
    const busy = this.busy === item.uri
    return html`<button class="play ${big ? 'big' : ''} ${busy ? 'busy' : ''}" aria-label="${t(this.hass, 'mu.play')}: ${item.name}"
      ?disabled=${!this.target} @click=${(e: Event) => { e.stopPropagation(); void run() }}>
      ${busy ? html`<span class="spinner small"></span>` : html`<ha-icon icon="mdi:play"></ha-icon>`}</button>`
  }

  /** A cover in a row: opens lists, plays tracks and stations */
  private tile(item: MediaItem) {
    const round = item.media_type === 'artist'
    const on = playsItem(this.player, item)
    const act = () => (canOpenItem(item) ? this.open(item) : this.play(item))
    return html`<div class="tile ${on ? 'on' : ''}" role="button" tabindex="0" title=${item.name} @click=${act}
      @keydown=${(e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), act())}>
      <div style="position:relative">
        ${this.art(item.image, this.iconFor(item), round)}
        ${on && item.media_type === 'radio' ? html`<span class="badge">${t(this.hass, 'mu.on_air')}</span>` : nothing}
        ${this.playButton(item)}
      </div>
      <span class="t">${item.name}</span>
      <span class="s">${itemSub(item) || this.typeLabel(item.media_type)}</span>
    </div>`
  }

  private menuFor(item: MediaItem, start?: { list: MediaItem }) {
    const open = this.menu === item.uri
    const act = (fn: () => void) => (e: Event) => { e.stopPropagation(); fn() }
    return html`<div class="menu-wrap">
      <button class="icon-btn" aria-label="Menü" aria-haspopup="menu" aria-expanded=${open}
        @click=${(e: Event) => {
          e.stopPropagation()
          // Low on the screen the menu opens upwards, clear of the player bar
          this.menuUp = (e.currentTarget as HTMLElement).getBoundingClientRect().top > window.innerHeight / 2
          this.menu = open ? undefined : item.uri
          this.panel = undefined
        }}><ha-icon icon="mdi:dots-vertical"></ha-icon></button>
      ${open ? html`<div class="menu ${this.menuUp ? 'up' : ''}" role="menu">
        <button role="menuitem" @click=${act(() => (start ? this.play(start.list, 'replace', { start: item }) : this.play(item)))}><ha-icon icon="mdi:play"></ha-icon>${t(this.hass, 'mu.play')}</button>
        <button role="menuitem" @click=${act(() => this.play(item, 'next'))}><ha-icon icon="mdi:skip-next"></ha-icon>${t(this.hass, 'mu.play_next')}</button>
        <button role="menuitem" @click=${act(() => this.play(item, 'add'))}><ha-icon icon="mdi:playlist-plus"></ha-icon>${t(this.hass, 'mu.add')}</button>
        <button role="menuitem" @click=${act(() => this.play(item, 'replace', { radio: true }))}><ha-icon icon="mdi:radio"></ha-icon>${t(this.hass, 'mu.start_radio')}</button>
      </div>` : nothing}
    </div>`
  }

  /** A track as a row; in a playlist a tap plays the list from there */
  private row(item: MediaItem, n: number, list?: MediaItem) {
    const on = playsItem(this.player, item)
    const run = () => (list ? this.play(list, 'replace', { start: item }) : this.play(item))
    const busy = this.busy === item.uri
    return html`<div class="row ${on ? 'on' : ''}" role="button" tabindex="0" @click=${run}
      @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && run()}>
      <span class="n">${busy ? html`<span class="spinner small"></span>` : on && this.player?.state === 'playing' ? eq : n}</span>
      ${this.art(item.image, this.iconFor(item))}
      <div style="min-width:0"><div class="t">${item.name}</div><div class="s">${itemSub(item)}</div></div>
      <span class="dur">${item.duration ? formatTime(item.duration) : ''}</span>
      ${this.menuFor(item, list ? { list } : undefined)}
    </div>`
  }

  private section(title: string, body: TemplateResult, more?: () => void) {
    return html`<div class="section"><div class="section-head"><h3>${title}</h3>
      ${more ? html`<button class="pill quiet small" @click=${more}>${t(this.hass, 'mu.all')}</button>` : nothing}</div>${body}</div>`
  }

  /** The Spotify account chip with its menu, as at the top of HArmony's music page */
  private accountChip() {
    const accounts = this.accounts ?? []
    const current = this.currentAccount
    if (!current) return nothing
    const open = this.menu === 'account'
    return html`<div class="menu-wrap">
      <button class="chip spotify" aria-haspopup="menu" aria-expanded=${open} title=${t(this.hass, 'mu.account')}
        @click=${(e: Event) => { e.stopPropagation(); this.menuUp = false; this.panel = undefined; this.menu = open ? undefined : 'account' }}>
        <ha-icon icon="mdi:spotify"></ha-icon><span>${current.name}</span>
        ${this.spotifyLoading ? html`<span class="spinner small"></span>` : accounts.length > 1 ? html`<ha-icon icon="mdi:chevron-down"></ha-icon>` : nothing}
      </button>
      ${open && accounts.length > 1 ? html`<div class="menu" role="menu">
        <div class="pop-head">${t(this.hass, 'mu.account')}</div>
        ${accounts.map(a => html`<button role="menuitemradio" aria-checked=${a.id === current.id} @click=${(e: Event) => { e.stopPropagation(); this.selectAccount(a.id) }}>
          <ha-icon icon="mdi:spotify" style="color:#1db954;opacity:1"></ha-icon><span style="flex:1">${a.name}</span>
          ${a.id === current.id ? html`<ha-icon icon="mdi:check"></ha-icon>` : nothing}</button>`)}
      </div>` : nothing}
    </div>`
  }

  private notMa() {
    return this.info && !this.info.ma ? html`<p class="hint">${t(this.hass, 'mu.not_ma')}</p>` : nothing
  }

  // ── Views ────────────────────────────────────────────────

  private renderHome() {
    const lib = this.lib
    if (!lib) {
      return this.libFailed ? this.failed(() => this.retryLibrary()) : html`<div class="center"><span class="spinner"></span></div>`
    }
    const shelves = this.shelves ?? []
    const spotifyPlaylists = shelves.find(s => s.key === 'current_user_playlists')?.items ?? []
    const maRecent = lib.recent.filter(i => i.media_type === 'playlist')
    // Spotify's playlists first, as in HArmony; without Spotify the ones Music Assistant played last
    const quick = (spotifyPlaylists.length ? spotifyPlaylists : maRecent.length ? maRecent : lib.playlists).slice(0, 8)
    const head = this.accounts?.length ? html`<div class="home-head">${this.accountChip()}</div>` : nothing
    if (!quick.length && !shelves.length && !lib.recent.length && !lib.artists.length && !lib.tracks.length) {
      return html`${head}<div class="placeholder"><ha-icon icon="mdi:music-circle-outline"></ha-icon>${t(this.hass, 'mu.empty')}</div>`
    }
    const ma = lib.recent.length || lib.artists.length || lib.tracks.length || lib.radio.length
    return html`
      ${head}
      ${this.notMa()}
      ${quick.length ? html`<div class="section"><div class="quick">${quick.map(item => html`
        <div class="quick-item" role="button" tabindex="0" @click=${() => this.open(item)}
          @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.open(item)}>
          ${this.art(item.image, 'mdi:playlist-music')}<span>${item.name}</span>${this.playButton(item)}
        </div>`)}</div></div>` : nothing}
      ${shelves.map(shelf => this.section(shelf.folder.name, html`<div class="tiles">${shelf.items.slice(0, 12).map(i => this.tile(i))}</div>`,
        shelf.items.length > 6 ? () => this.open(shelf.folder) : undefined))}
      ${shelves.length && ma ? html`<div class="sub-head" style="margin-top:30px"><ha-icon icon="mdi:music-circle"></ha-icon>${t(this.hass, 'mu.ma_players')}</div>` : nothing}
      ${lib.recent.length ? this.section(t(this.hass, 'mu.recent'), html`<div class="tiles">${lib.recent.map(i => this.tile(i))}</div>`) : nothing}
      ${lib.artists.length ? this.section(t(this.hass, 'mu.artists'), html`<div class="tiles">${lib.artists.map(i => this.tile(i))}</div>`) : nothing}
      ${lib.tracks.length ? this.section(t(this.hass, 'mu.tracks'), html`<div class="rows">${lib.tracks.map((i, n) => this.row(i, n + 1))}</div>`) : nothing}
      ${lib.radio.length ? this.section(t(this.hass, 'mu.radio'), html`<div class="tiles">${lib.radio.slice(0, 12).map(i => this.tile(i))}</div>`) : nothing}
    `
  }

  private failed(retry: () => void) {
    return html`<div class="placeholder"><ha-icon icon="mdi:wifi-off"></ha-icon>${t(this.hass, 'mu.error')}
      <button class="pill quiet" @click=${retry}>${t(this.hass, 'mu.retry')}</button></div>`
  }

  private renderSearch() {
    const r = this.results
    const groups: [keyof SearchResults, Key][] = [['artists', 'mu.type.artists'], ['albums', 'mu.type.albums'], ['playlists', 'mu.type.playlists'], ['radio', 'mu.radio']]
    const any = r && Object.values(r).some(list => list?.length)
    return html`
      <form class="search" @submit=${(e: Event) => { e.preventDefault(); void this.search() }}>
        <label><ha-icon icon="mdi:magnify"></ha-icon>
          <input type="search" .value=${this.query} placeholder=${t(this.hass, 'mu.search_hint')} aria-label=${t(this.hass, 'mu.search')}
            @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value }}>
        </label>
        <button class="pill" type="submit" ?disabled=${!this.query.trim()}>${t(this.hass, 'mu.search')}</button>
      </form>
      ${this.notMa()}
      ${this.searching ? html`<div class="center"><span class="spinner"></span></div>`
        : this.searchFailed ? this.failed(() => this.search())
        : !r ? html`<div class="placeholder"><ha-icon icon="mdi:magnify"></ha-icon>${t(this.hass, 'mu.search_hint')}</div>`
        : !any ? html`<div class="placeholder"><ha-icon icon="mdi:music-off"></ha-icon>${t(this.hass, 'mu.no_results')}</div>`
        : html`
          ${r.tracks?.length ? this.section(t(this.hass, 'mu.type.tracks'), html`<div class="rows">${r.tracks.slice(0, 10).map((i, n) => this.row(i, n + 1))}</div>`) : nothing}
          ${groups.map(([key, label]) => r[key]?.length ? this.section(t(this.hass, label), html`<div class="tiles">${r[key]!.map(i => this.tile(i))}</div>`) : nothing)}
        `}
    `
  }

  private renderRadio() {
    if (!this.lib) return this.libFailed ? this.failed(() => this.retryLibrary()) : html`<div class="center"><span class="spinner"></span></div>`
    return html`
      ${this.notMa()}
      ${this.lib.radio.length ? html`<div class="tiles wrap">${this.lib.radio.map(i => this.tile(i))}</div>`
        : html`<div class="placeholder"><ha-icon icon="mdi:radio-tower"></ha-icon>${t(this.hass, 'mu.no_radio')}</div>`}
    `
  }

  private renderDetail() {
    const d = this.detail
    if (!d) return nothing
    const item = d.item
    const tracks = d.children?.filter(c => c.media_type === 'track') ?? []
    const others = d.children?.filter(c => c.media_type !== 'track') ?? []
    const back = this.from === 'detail' ? 'home' : this.from
    return html`
      <button class="back" @click=${() => { this.view = back; this.detail = undefined }}><ha-icon icon="mdi:arrow-left"></ha-icon>${t(this.hass, `mu.${back}` as Key)}</button>
      <div class="hero">
        ${this.art(item.image, this.iconFor(item), item.media_type === 'artist')}
        <div style="min-width:0">
          <div class="type">${this.typeLabel(item.media_type)}</div>
          <h1>${item.name}</h1>
          <div class="meta">${[itemSub(item), tracks.length ? t(this.hass, 'mu.tracks_n', { n: tracks.length }) : ''].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div class="actions">
        ${this.playButton(item, true)}
        <button class="ctrl" aria-label=${t(this.hass, 'mu.shuffle')} title=${t(this.hass, 'mu.shuffle')} ?disabled=${!this.target}
          @click=${() => this.shuffle(item)}><ha-icon icon="mdi:shuffle-variant"></ha-icon></button>
        ${this.menuFor(item)}
      </div>
      ${this.notMa()}
      ${d.loading ? html`<div class="center"><span class="spinner"></span></div>`
        : d.failed ? html`<p class="hint">${t(this.hass, 'mu.open_failed')}</p>`
        : html`
          ${others.length ? html`<div class="tiles wrap" style="margin-bottom:24px">${others.map(i => this.tile(i))}</div>` : nothing}
          ${tracks.length ? html`<div class="rows">${tracks.map((i, n) => this.row(i, n + 1, ['playlist', 'album'].includes(item.media_type) || (item.media_type === 'folder' && isSpotifyItem(item)) ? item : undefined))}</div>` : nothing}
        `}
    `
  }

  private renderPlayers() {
    const selected = this.playerId
    const lead = this.target
    const members = groupMembers(this.player)
    const card = (p: MusicPlayer) => {
      const e = this.hass!.states[p.entity]
      const off = !this.reachable(p.entity)
      const playing = e?.state === 'playing'
      const a = e?.attributes ?? {}
      const np = playing || e?.state === 'paused' ? [a.media_title, a.media_artist].filter(Boolean).join(' · ') : off ? t(this.hass, 'mu.unavailable') : t(this.hass, 'mu.idle')
      const pic = playing || e?.state === 'paused' ? playerPicture(e) : undefined
      const grouped = members.includes(p.entity)
      const canGroup = lead && p.ma && p.entity !== lead && !off && this.features() & F.GROUPING && this.canControl(lead)
      const volume = Math.round(Number(a.volume_level ?? 0) * 100)
      const stop = (e: Event) => e.stopPropagation()
      return html`<div class="player ${p.entity === selected ? 'selected' : ''} ${playing ? 'playing' : ''} ${off ? 'off' : ''}" role="button" tabindex="0"
        aria-pressed=${p.entity === selected} @click=${() => !off && this.select(p.entity)} @keydown=${(ev: KeyboardEvent) => ev.key === 'Enter' && !off && this.select(p.entity)}>
        ${pic ? html`<div class="bg" style="background-image:url('${pic}')"></div>` : nothing}
        <div class="top">
          <div class="icon ${p.spotify ? 'spotify' : ''}"><ha-icon icon=${p.spotify ? 'mdi:spotify' : a.mass_player_type === 'group' ? 'mdi:speaker-multiple' : 'mdi:speaker'}></ha-icon></div>
          <div style="min-width:0;flex:1"><div class="name">${p.name}</div>${p.area && !p.name.includes(p.area) ? html`<div class="area">${p.area}</div>` : nothing}</div>
          ${playing ? eq : nothing}
        </div>
        <div class="np">${np}</div>
        ${groupMembers(e).length ? html`<div class="area">${t(this.hass, 'mu.with', { names: groupMembers(e).map(id => this.nameOf(id)).join(', ') })}</div>` : nothing}
        ${off ? nothing : html`<div class="foot" @click=${stop} @keydown=${stop}>
          ${this.features(e) & F.VOLUME_SET ? html`<ha-icon icon="mdi:volume-medium" style="opacity:.5;--mdc-icon-size:16px"></ha-icon>
            <input type="range" min="0" max="100" .value=${String(volume)} aria-label="${t(this.hass, 'mu.volume')} ${p.name}" ?disabled=${!this.canControl(p.entity)}
              @change=${(ev: Event) => this.control('volume_set', { volume_level: Number((ev.target as HTMLInputElement).value) / 100 }, p.entity)}>` : html`<span style="flex:1"></span>`}
          ${canGroup ? html`<button class="chip ${grouped ? 'on' : ''}" @click=${() => this.toggleGroup(p.entity)}>
            <ha-icon icon=${grouped ? 'mdi:link-variant-off' : 'mdi:link-variant'}></ha-icon>${t(this.hass, grouped ? 'mu.unjoin' : 'mu.join')}</button>` : nothing}
        </div>`}
      </div>`
    }
    const ma = this.players.filter(p => p.ma)
    const spotify = this.players.filter(p => p.spotify)
    return html`
      ${ma.length ? html`<div class="sub-head"><ha-icon icon="mdi:music-circle"></ha-icon>${t(this.hass, 'mu.ma_players')}</div>
        <div class="players">${ma.map(card)}</div>` : nothing}
      ${spotify.length ? html`<div class="sub-head"><ha-icon icon="mdi:spotify"></ha-icon>${t(this.hass, 'mu.spotify')}</div>
        <div class="players">${spotify.map(card)}</div>` : nothing}
    `
  }

  // ── Player bar ───────────────────────────────────────────

  private renderQueue() {
    const q = this.queue
    const line = (label: Key, entry: QueueInfo['current_item']) => entry ? html`
      <div class="pop-head">${t(this.hass, label)}</div>
      <div class="q">${this.art(entry.media_item?.image)}<div class="text">
        <div class="t">${entry.media_item?.name ?? entry.name}</div><div class="s">${entry.media_item ? itemSub(entry.media_item) : ''}</div></div></div>` : nothing
    return html`<div class="pop" role="dialog" aria-label=${t(this.hass, 'mu.queue')}>
      ${!q ? html`<div class="center" style="padding:20px 0"><span class="spinner"></span></div>` : html`
        ${line('mu.now', q.current_item)}
        ${q.next_item ? line('mu.up_next', q.next_item) : html`<div class="note">${t(this.hass, 'mu.queue_end')}</div>`}
        ${q.items ? html`<div class="note">${t(this.hass, 'mu.queue_n', { n: q.items })}</div>` : nothing}
      `}
    </div>`
  }

  private renderTransfer() {
    const others = this.maPlayers.filter(p => p.entity !== this.target && this.reachable(p.entity))
    return html`<div class="pop" role="dialog" aria-label=${t(this.hass, 'mu.transfer')}>
      <div class="pop-head">${t(this.hass, 'mu.transfer')}</div>
      ${others.map(p => html`<button class="item" @click=${() => this.transfer(p.entity)}>
        <ha-icon icon=${this.hass!.states[p.entity]?.attributes.mass_player_type === 'group' ? 'mdi:speaker-multiple' : 'mdi:speaker'}></ha-icon>
        <span style="flex:1;min-width:0">${p.name}${p.area && !p.name.includes(p.area) ? html` <span style="opacity:.5">· ${p.area}</span>` : nothing}</span>
        ${this.hass!.states[p.entity]?.state === 'playing' ? eq : nothing}
      </button>`)}
    </div>`
  }

  private renderBar() {
    const p = this.player
    if (!p) return nothing
    const a = p.attributes
    const f = this.features(p)
    const ctl = this.canControl(p.entity_id)
    const playing = p.state === 'playing'
    const active = ['playing', 'paused', 'buffering'].includes(p.state)
    const title = active ? (a.media_title ?? a.app_name) as string | undefined : undefined
    const sub = active ? [a.media_artist ?? a.media_album_artist, a.media_album_name].filter(Boolean)[0] as string | undefined : undefined
    const duration = Number(a.media_duration) || 0
    const position = mediaPosition(p, this.now)
    const volume = Math.round(Number(a.volume_level ?? 0) * 100)
    const muted = !!a.is_volume_muted
    const repeat = (a.repeat ?? 'off') as string
    const toggle = (panel: 'queue' | 'transfer' | 'volume') => (e: Event) => {
      e.stopPropagation()
      this.panel = this.panel === panel ? undefined : panel
      this.menu = undefined
      if (this.panel === 'queue') { this.queue = undefined; this.queueFor = ''; this.requestUpdate() }
    }
    const members = groupMembers(p)
    const volumeIcon = muted || volume === 0 ? 'mdi:volume-off' : volume < 50 ? 'mdi:volume-medium' : 'mdi:volume-high'
    const setVolume = (e: Event) => this.control('volume_set', { volume_level: Number((e.target as HTMLInputElement).value) / 100 })
    return html`<div class="bar card"><div class="bar-in">
      ${this.message ? html`<div class="message" role="status">${this.message}</div>` : nothing}
      <div class="track">
        ${this.art(active ? playerPicture(p) : undefined)}
        <div class="text">
          <span class="t">${title ?? t(this.hass, 'mu.idle')}</span>
          ${sub ? html`<span class="s">${sub}</span>` : nothing}
          <button class="who" @click=${() => { this.view = 'players' }} title=${t(this.hass, 'mu.players')}>
            <ha-icon icon=${this.info?.spotify ? 'mdi:spotify' : members.length ? 'mdi:speaker-multiple' : 'mdi:speaker'}></ha-icon>
            <span>${this.info?.name}${members.length ? ` + ${members.length}` : ''}</span>
          </button>
        </div>
      </div>
      <div class="center-col">
        <div class="ctrls">
          ${f & F.SHUFFLE ? html`<button class="ctrl small ${a.shuffle ? 'on' : ''}" aria-label=${t(this.hass, 'mu.shuffle')} aria-pressed=${!!a.shuffle} title=${t(this.hass, 'mu.shuffle')}
            ?disabled=${!ctl} @click=${() => this.control('shuffle_set', { shuffle: !a.shuffle })}><ha-icon icon="mdi:shuffle-variant"></ha-icon></button>` : nothing}
          <button class="ctrl" aria-label=${t(this.hass, 'mu.previous')} title=${t(this.hass, 'mu.previous')} ?disabled=${!ctl || !(f & F.PREVIOUS) || !active}
            @click=${() => this.control('media_previous_track')}><ha-icon icon="mdi:skip-previous"></ha-icon></button>
          <button class="ctrl main" aria-label=${t(this.hass, playing ? 'mu.pause' : 'mu.play')} ?disabled=${!ctl || !(f & (playing ? F.PAUSE : F.PLAY))}
            @click=${() => this.control(playing ? 'media_pause' : 'media_play')}><ha-icon icon=${playing ? 'mdi:pause' : 'mdi:play'}></ha-icon></button>
          <button class="ctrl" aria-label=${t(this.hass, 'mu.next')} title=${t(this.hass, 'mu.next')} ?disabled=${!ctl || !(f & F.NEXT) || !active}
            @click=${() => this.control('media_next_track')}><ha-icon icon="mdi:skip-next"></ha-icon></button>
          ${f & F.REPEAT ? html`<button class="ctrl small ${repeat !== 'off' ? 'on' : ''}" aria-label=${t(this.hass, 'mu.repeat')} aria-pressed=${repeat !== 'off'} title=${t(this.hass, 'mu.repeat')}
            ?disabled=${!ctl} @click=${() => this.control('repeat_set', { repeat: repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off' })}>
            <ha-icon icon=${repeat === 'one' ? 'mdi:repeat-once' : 'mdi:repeat'}></ha-icon></button>` : nothing}
        </div>
        ${duration && active ? html`<div class="progress">
          <span>${formatTime(position)}</span>
          <input type="range" min="0" max=${duration} step="1" .value=${String(Math.round(position))} aria-label="Position"
            ?disabled=${!ctl || !(f & F.SEEK)} @change=${(e: Event) => this.control('media_seek', { seek_position: Number((e.target as HTMLInputElement).value) })}>
          <span>${formatTime(duration)}</span>
        </div>` : nothing}
      </div>
      <div class="right">
        ${this.target ? html`<div class="panel-wrap">
          <button class="ctrl small ${this.panel === 'queue' ? 'on' : ''}" aria-label=${t(this.hass, 'mu.queue')} title=${t(this.hass, 'mu.queue')} aria-expanded=${this.panel === 'queue'}
            @click=${toggle('queue')}><ha-icon icon="mdi:playlist-play"></ha-icon></button>
          ${this.panel === 'queue' ? this.renderQueue() : nothing}
        </div>
        <div class="panel-wrap">
          <button class="ctrl small ${this.panel === 'transfer' ? 'on' : ''}" aria-label=${t(this.hass, 'mu.transfer')} title=${t(this.hass, 'mu.transfer')} aria-expanded=${this.panel === 'transfer'}
            ?disabled=${!ctl || this.maPlayers.length < 2} @click=${toggle('transfer')}><ha-icon icon="mdi:cast-audio"></ha-icon></button>
          ${this.panel === 'transfer' ? this.renderTransfer() : nothing}
        </div>` : nothing}
        ${f & F.VOLUME_SET ? html`
          <div class="panel-wrap vol-btn">
            <button class="ctrl small" aria-label=${t(this.hass, 'mu.volume')} aria-expanded=${this.panel === 'volume'} @click=${toggle('volume')}><ha-icon icon=${volumeIcon}></ha-icon></button>
            ${this.panel === 'volume' ? html`<div class="pop" style="min-width:220px;padding:14px 16px"><input type="range" style="width:100%" min="0" max="100" .value=${String(volume)}
              aria-label=${t(this.hass, 'mu.volume')} ?disabled=${!ctl} @change=${setVolume}></div>` : nothing}
          </div>
          <button class="ctrl small vol-icon" aria-label=${t(this.hass, 'mu.mute')} aria-pressed=${muted} title=${t(this.hass, 'mu.mute')} ?disabled=${!ctl || !(f & F.VOLUME_MUTE)}
            @click=${() => this.control('volume_mute', { is_volume_muted: !muted })}><ha-icon icon=${volumeIcon}></ha-icon></button>
          <input class="vol" type="range" min="0" max="100" .value=${String(volume)} aria-label=${t(this.hass, 'mu.volume')} ?disabled=${!ctl} @change=${setVolume}>
        ` : nothing}
      </div>
    </div></div>`
  }

  protected render() {
    if (!this.players.length) return nothing
    const views: [View, string, Key][] = [['home', 'mdi:home-variant-outline', 'mu.home'], ['search', 'mdi:magnify', 'mu.search'], ['radio', 'mdi:radio', 'mu.radio'], ['players', 'mdi:speaker-multiple', 'mu.players']]
    const current = this.view === 'detail' ? this.from : this.view
    const go = (view: View) => { this.view = view; this.detail = undefined; this.menu = undefined }
    const glow = playerPicture(this.player)
    const playlists = [...(this.shelves?.find(s => s.key === 'current_user_playlists')?.items ?? []), ...(this.lib?.playlists ?? [])]
    return html`<div class="music">
      <aside class="side card">
        <nav>${views.map(([view, icon, label]) => html`<button class="nav" aria-current=${current === view && this.view !== 'detail'} @click=${() => go(view)}>
          <ha-icon icon=${icon}></ha-icon><span>${t(this.hass, label)}</span></button>`)}</nav>
        ${playlists.length ? html`
          <div class="lib-head"><ha-icon icon="mdi:bookshelf"></ha-icon>${t(this.hass, 'mu.library')}<span style="margin-left:auto">${playlists.length}</span></div>
          <div class="libs">${playlists.map(item => html`<button class="lib" aria-current=${this.view === 'detail' && this.detail?.item.uri === item.uri}
            @click=${() => this.open(item)}>${this.art(item.image, 'mdi:playlist-music')}
            <span class="lib-text"><span>${item.name}</span><small><ha-icon icon=${isSpotifyItem(item) ? 'mdi:spotify' : 'mdi:music-circle'}></ha-icon>${isSpotifyItem(item) ? this.currentAccount?.name ?? 'Spotify' : 'Music Assistant'}</small></span>
          </button>`)}</div>` : nothing}
      </aside>
      <main class="main card">
        ${glow && ['playing', 'paused'].includes(this.player?.state ?? '') ? html`<div class="glow-wrap"><div class="glow" style="background-image:url('${glow}')"></div></div>` : nothing}
        ${this.view === 'home' ? this.renderHome()
          : this.view === 'search' ? this.renderSearch()
          : this.view === 'radio' ? this.renderRadio()
          : this.view === 'players' ? this.renderPlayers()
          : this.renderDetail()}
      </main>
      ${this.renderBar()}
    </div>`
  }
}
