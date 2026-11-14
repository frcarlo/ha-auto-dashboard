// Picks a folder of HA's media for the photo face's slideshow: Immich → albums → "Italien", or a folder of local media.
// Used in the dashboard editor and on the user's own settings page, so it brings its own quiet styles.
import { LitElement, css, html, nothing } from 'lit'
import { t } from './i18n'
import { albumPictures, browseMedia, thumbnailUrl, type MediaNode } from './slideshow'
import type { HomeAssistant } from './types'

/** How long a picture of the album stays, in seconds, to pick from */
export const SLIDE_INTERVALS = [10, 30, 60, 300]

/** The face with another album; without one its slideshow settings go too */
export function withAlbum<F extends { album?: string; interval?: number; shuffle?: boolean }>(face: F, album?: string): F {
  const { album: _a, interval: _i, shuffle: _s, ...rest } = face
  return (album ? { ...rest, album, ...(face.interval !== undefined ? { interval: face.interval } : {}), ...(face.shuffle === false ? { shuffle: false } : {}) } : rest) as F
}

export class AdAlbumPicker extends LitElement {
  static properties = {
    hass: { attribute: false },
    value: {},
    open: { state: true },
    trail: { state: true },
    folder: { state: true },
    loading: { state: true },
    failed: { state: true },
    chosen: { state: true },
  }

  hass?: HomeAssistant
  value?: string
  open = false
  /** The folders opened on the way down, the top level first */
  trail: MediaNode[] = []
  folder?: MediaNode
  loading = false
  failed = false
  /** The chosen folder's name and how many pictures it holds */
  chosen?: { title: string; count: number } | 'missing'
  private chosenFor?: string

  private l(key: Parameters<typeof t>[1], vars?: Record<string, string | number>) {
    return t(this.hass, key, vars)
  }

  private nameOf(node: MediaNode) {
    return node.title || this.l('face.album_unnamed')
  }

  protected updated() {
    const value = this.value
    if (!this.hass?.callWS || value === this.chosenFor) return
    this.chosenFor = value
    this.chosen = undefined
    if (!value) return
    browseMedia(this.hass, value)
      .then(node => { if (this.value === value) this.chosen = { title: this.nameOf(node), count: albumPictures(node).length } })
      .catch(() => { if (this.value === value) this.chosen = 'missing' })
  }

  private async go(id: string | undefined, trail: MediaNode[]) {
    if (!this.hass?.callWS) return
    this.loading = true
    this.failed = false
    try {
      const node = await browseMedia(this.hass, id)
      this.folder = node
      this.trail = [...trail, node]
      void this.signThumbnails(node)
    } catch {
      this.failed = true
    } finally {
      this.loading = false
    }
  }

  /** The subfolders' thumbnails, signed where HA serves them itself */
  private async signThumbnails(node: MediaNode) {
    const hass = this.hass!
    const todo = (node.children ?? []).filter(c => c.can_expand && c.thumbnail && !this.thumbs.has(c.thumbnail))
    await Promise.all(todo.map(async c => {
      try { this.thumbs.set(c.thumbnail!, await thumbnailUrl(hass, c.thumbnail!)) } catch { /* no picture then */ }
    }))
    if (todo.length) this.requestUpdate()
  }

  private thumbs = new Map<string, string>()

  private start() {
    this.open = true
    this.trail = []
    void this.go(undefined, [])
  }

  private pick(value?: string) {
    this.open = false
    this.dispatchEvent(new CustomEvent('value-changed', { detail: { value }, bubbles: true, composed: true }))
  }

  private browser() {
    const folder = this.folder
    const subfolders = (folder?.children ?? []).filter(c => c.can_expand)
    const count = albumPictures(folder).length
    return html`<div class="browser">
      <nav class="trail">${this.trail.map((node, i) => html`
        ${i ? html`<span class="sep">›</span>` : nothing}
        <button class="crumb" ?disabled=${i === this.trail.length - 1}
          @click=${() => this.go(i ? node.media_content_id : undefined, this.trail.slice(0, i))}>${i ? this.nameOf(node) : this.l('face.media')}</button>`)}
      </nav>
      ${this.failed ? html`<p class="note">${this.l('face.album_error')}</p>` : nothing}
      <ul class="list" aria-busy=${this.loading}>
        ${subfolders.map(c => html`<li><button class="item" @click=${() => this.go(c.media_content_id, this.trail)}>
          ${c.thumbnail && this.thumbs.get(c.thumbnail) ? html`<img src=${this.thumbs.get(c.thumbnail)!} alt="" loading="lazy">` : html`<ha-icon icon="mdi:folder-outline"></ha-icon>`}
          <span>${this.nameOf(c)}</span><ha-icon class="go" icon="mdi:chevron-right"></ha-icon></button></li>`)}
        ${!this.loading && !subfolders.length && !count ? html`<li class="note">${this.l('face.album_empty')}</li>` : nothing}
      </ul>
      <div class="actions">
        <button class="text" @click=${() => (this.open = false)}>${this.l('cal.cancel')}</button>
        <button class="primary" ?disabled=${!count || this.trail.length < 2} @click=${() => this.pick(folder?.media_content_id)}>
          ${this.l('face.album_use')}${count ? ` · ${this.l('face.album_photos', { count })}` : ''}</button>
      </div>
    </div>`
  }

  protected render() {
    const chosen = this.chosen
    const label = !this.value ? this.l('face.album_none')
      : chosen === 'missing' ? this.l('face.album_error')
      : chosen ? `${chosen.title} · ${this.l('face.album_photos', { count: chosen.count })}` : '…'
    return html`
      <div class="current">
        <ha-icon icon=${this.value ? 'mdi:image-multiple-outline' : 'mdi:image-outline'}></ha-icon>
        <span class="label">${label}</span>
        ${this.value ? html`<button class="text" @click=${() => this.pick(undefined)}>${this.l('face.album_clear')}</button>` : nothing}
        ${this.open ? nothing : html`<button class="text" @click=${() => this.start()}>${this.l(this.value ? 'face.album_change' : 'face.album_pick')}</button>`}
      </div>
      ${this.open ? this.browser() : nothing}`
  }

  static styles = css`
    :host { display: block; font-size: 14px; --line: color-mix(in srgb, currentColor 16%, transparent); }
    button { font: inherit; color: inherit; cursor: pointer; }
    button:disabled { cursor: default; opacity: 0.45; }
    .current { display: flex; align-items: center; gap: 10px; min-height: 40px; }
    .current .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    ha-icon { --mdc-icon-size: 20px; flex: none; opacity: 0.75; }
    .text { border: 0; background: none; padding: 6px 10px; border-radius: 8px; font-weight: 500; color: var(--primary-color, rgb(var(--ad-primary, 99 102 241))); }
    .text:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
    .browser { margin-top: 6px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    .trail { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
    .crumb { border: 0; background: none; padding: 4px 6px; border-radius: 6px; }
    .crumb:not(:disabled):hover { background: color-mix(in srgb, currentColor 10%, transparent); }
    .crumb:disabled { opacity: 1; font-weight: 600; }
    .sep { opacity: 0.5; }
    .list { list-style: none; margin: 0; padding: 4px 0; max-height: 280px; overflow-y: auto; }
    .list[aria-busy=true] { opacity: 0.5; }
    .item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 6px 12px; border: 0; background: none; text-align: left; }
    .item:hover { background: color-mix(in srgb, currentColor 7%, transparent); }
    .item span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item img { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; flex: none; }
    .item ha-icon { width: 36px; text-align: center; }
    .item .go { width: auto; opacity: 0.4; }
    .note { padding: 10px 12px; margin: 0; opacity: 0.65; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--line); }
    .primary {
      border: 0; border-radius: 18px; padding: 8px 16px; font-weight: 500;
      background: var(--primary-color, rgb(var(--ad-primary, 99 102 241))); color: var(--text-primary-color, #fff);
    }
  `
}

if (!customElements.get('ad-album-picker')) customElements.define('ad-album-picker', AdAlbumPicker)
