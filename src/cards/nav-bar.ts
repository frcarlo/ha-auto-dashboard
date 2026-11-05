// Floating bar, the dashboard's only navigation: bottom (default), top, or a side rail left/right. Rendered into document.body so no ancestor (transforms,
// container queries) can break position: fixed. In place it only leaves a spacer.
import { css, html, render } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { tokens } from '../styles/tokens'
import type { NavPosition } from '../types'
import { PALETTE_VARS, haThemeVars } from '../styles/palette'

export interface NavItem {
  path: string
  icon: string
  label: string
}

interface NavBarConfig extends BaseConfig {
  items: NavItem[]
  position?: NavPosition
  /** false: HA's header and sidebar keep their theme when an accent color is set */
  ha_colors?: boolean
}


const barStyles = css`
  :host {
    position: fixed; z-index: 5; bottom: calc(12px + env(safe-area-inset-bottom));
    left: 50%; transform: translateX(-50%); width: min(520px, calc(100vw - 24px));
  }
  nav {
    display: flex; justify-content: space-around; padding: 6px; border-radius: 26px;
    background: var(--ad-glass-bg); backdrop-filter: var(--ad-glass-blur, blur(30px) saturate(180%)); -webkit-backdrop-filter: var(--ad-glass-blur, blur(30px) saturate(180%));
    box-shadow: 0 10px 36px rgba(0, 0, 0, 0.28), inset 0 1px 0 var(--ad-glass-hi);
  }
  a {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0; border-radius: 20px;
    color: rgba(var(--ad-on-surface), 0.55); text-decoration: none; font-size: 10px; letter-spacing: 0.02em;
    -webkit-tap-highlight-color: transparent;
  }
  a ha-icon { --mdc-icon-size: 22px; }
  a[aria-current=page] { color: rgb(var(--ad-primary)); background: rgba(var(--ad-primary), 0.12); }

  :host([pos=top]) { bottom: auto; top: calc(var(--header-height, 56px) + env(safe-area-inset-top) + 12px); }
  /* Side rails need room next to the cards; narrower screens keep the bottom bar */
  @media (min-width: 1024px) {
    :host([pos=left]), :host([pos=right]) { width: auto; bottom: auto; top: 50%; transform: translateY(-50%); }
    /* --ad-offset is the width of HA's sidebar, measured at runtime */
    :host([pos=left]) { left: calc(var(--ad-offset, 0px) + 12px); }
    :host([pos=right]) { left: auto; right: 12px; }
    :host([pos=left]) nav, :host([pos=right]) nav { flex-direction: column; gap: 2px; }
    :host([pos=left]) a, :host([pos=right]) a { flex: none; width: 64px; padding: 8px 0; }
  }
`

let bar: HTMLElement | undefined
let users = 0

let sidebarObserver: ResizeObserver | undefined

/**
 * The view that got room for a side rail. Module-wide like the bar: when HA rebuilds a view's cards,
 * the new nav card joins before the old one leaves, so the old one must not take the room away again.
 */
let paddedView: HTMLElement | undefined

function pad(view: HTMLElement | undefined, side: 'left' | 'right' | undefined) {
  if (paddedView && paddedView !== view) {
    paddedView.style.paddingLeft = ''
    paddedView.style.paddingRight = ''
  }
  paddedView = view
  if (!view) return
  view.style.paddingLeft = side === 'left' ? '88px' : ''
  view.style.paddingRight = side === 'right' ? '88px' : ''
}

/** HA variables this dashboard changed on <home-assistant>, with the inline values they had before. */
let haColors: Map<string, string> | undefined

/**
 * Colors HA's own UI (header, sidebar, dialogs) while the dashboard is open. The variables go inline on
 * <home-assistant>, above the theme HA sets on <html>, and are put back when the dashboard closes.
 */
function tintHa(vars: Record<string, string> | undefined) {
  const root = document.querySelector('home-assistant') as HTMLElement | null
  if (!root) return
  if (haColors) for (const [name, before] of haColors) before ? root.style.setProperty(name, before) : root.style.removeProperty(name)
  haColors = undefined
  if (!vars) return
  haColors = new Map(Object.keys(vars).map(name => [name, root.style.getPropertyValue(name)]))
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
}

function haSidebar() {
  const main = document.querySelector('home-assistant')?.shadowRoot?.querySelector('home-assistant-main')
  return main?.shadowRoot?.querySelector('ha-sidebar') ?? undefined
}

/** Right edge of HA's sidebar, so a left rail doesn't sit on top of it. */
function sidebarRight() {
  return Math.max(0, haSidebar()?.getBoundingClientRect().right ?? 0)
}

function currentView() {
  return location.pathname.split('/')[2] ?? ''
}

export class AdNavBar extends BaseCard<NavBarConfig> {
  static styles = [tokens, css`
    /* Keeps cards clear of the floating bar; side rails need no space in the flow */
    :host { display: block; height: 72px; }
    @media (min-width: 1024px) {
      :host([pos=left]), :host([pos=right]) { height: 0; }
    }
  `]

  private onLocation = () => this.paint()
  private onResize = () => this.paint()

  /** HA's sections view this card lives in, found across shadow roots. */
  private findView(): HTMLElement | undefined {
    let node: Node | null = this
    while (node) {
      node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null)
      if (node instanceof HTMLElement && node.tagName === 'HUI-SECTIONS-VIEW') return node
    }
    return undefined
  }

  /** A side rail floats over the outer card column, so the view gives it room. */
  private padView() {
    const side = this.config?.position === 'left' || this.config?.position === 'right' ? this.config.position : undefined
    const view = this.findView()
    if (!view) return
    pad(view, side && window.innerWidth >= 1024 ? side : undefined)
  }

  getGridOptions() {
    return { columns: 'full', rows: 'auto' }
  }

  getCardSize() {
    return 0
  }

  connectedCallback() {
    super.connectedCallback()
    users++
    if (!bar) {
      bar = document.createElement('ad-nav-bar-portal')
      bar.attachShadow({ mode: 'open' })
      document.body.appendChild(bar)
      // Collapsing HA's sidebar changes its width without a window resize
      const sidebar = haSidebar()
      if (sidebar) {
        sidebarObserver = new ResizeObserver(() => bar?.style.setProperty('--ad-offset', `${sidebarRight()}px`))
        sidebarObserver.observe(sidebar)
      }
    }
    window.addEventListener('location-changed', this.onLocation)
    window.addEventListener('popstate', this.onLocation)
    window.addEventListener('resize', this.onResize)
    // HA may move an unchanged card into a rebuilt view; nothing re-renders then, so place the rail again
    if (this.hasUpdated) this.paint()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('location-changed', this.onLocation)
    window.removeEventListener('popstate', this.onLocation)
    window.removeEventListener('resize', this.onResize)
    // Defer, so switching views (old card leaves, new one joins) keeps the bar and the room in place
    users--
    setTimeout(() => {
      if (users === 0 && bar) {
        bar.remove()
        bar = undefined
        sidebarObserver?.disconnect()
        sidebarObserver = undefined
        tintHa(undefined)
        pad(undefined, undefined)
      }
    }, 0)
  }

  protected willUpdate() {
    super.willUpdate()
    this.setAttribute('pos', this.config?.position ?? 'bottom')
  }

  protected updated() {
    this.paint()
  }

  private paint() {
    if (!bar?.shadowRoot || !this.config) return
    bar.toggleAttribute('dark', this.hasAttribute('dark'))
    // The bar lives outside the card, so it takes over the card's palette
    for (const name of PALETTE_VARS) {
      const value = this.style.getPropertyValue(name)
      if (value) bar.style.setProperty(name, value)
      else bar.style.removeProperty(name)
    }
    bar.setAttribute('pos', this.config.position ?? 'bottom')
    const color = this.config.ha_colors === false ? undefined : this.config.primary_color
    tintHa(color ? haThemeVars(color, this.hasAttribute('dark')) : undefined)
    bar.style.setProperty('--ad-offset', `${sidebarRight()}px`)
    this.padView()
    // A bare dashboard URL shows the first view
    const active = currentView() || this.config.items[0]?.path
    const dashboard = location.pathname.split('/')[1]
    render(html`
      <style>${tokens.cssText}${barStyles.cssText}</style>
      <nav>
        ${this.config.items.map(item => html`
          <a href="/${dashboard}/${item.path}" aria-current=${active === item.path ? 'page' : 'false'}
            @click=${(e: Event) => { e.preventDefault(); this.navigate(item.path) }}>
            <ha-icon icon=${item.icon}></ha-icon>${item.label}
          </a>`)}
      </nav>`, bar.shadowRoot)
  }

  protected render() {
    return html``
  }
}

// Plain host element for the portal; it only needs to exist as a tag.
if (!customElements.get('ad-nav-bar-portal')) customElements.define('ad-nav-bar-portal', class extends HTMLElement {})
