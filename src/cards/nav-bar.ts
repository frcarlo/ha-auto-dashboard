// Mobile bottom bar. Rendered into document.body so no ancestor (transforms,
// container queries) can break position: fixed. In place it only leaves a spacer.
import { css, html, render } from 'lit'
import { BaseCard, type BaseConfig } from './base'
import { tokens } from '../styles/tokens'

export interface NavItem {
  path: string
  icon: string
  label: string
}

interface NavBarConfig extends BaseConfig {
  items: NavItem[]
}

const barStyles = css`
  :host { position: fixed; z-index: 5; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); display: none; }
  @media (max-width: 768px) { :host { display: block; } }
  nav {
    display: flex; justify-content: space-around; padding: 6px; border-radius: 26px;
    background: var(--ad-glass-bg); backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%);
    box-shadow: 0 10px 36px rgba(0, 0, 0, 0.28), inset 0 1px 0 var(--ad-glass-hi);
  }
  a {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0; border-radius: 20px;
    color: rgba(var(--ad-on-surface), 0.55); text-decoration: none; font-size: 10px; letter-spacing: 0.02em;
    -webkit-tap-highlight-color: transparent;
  }
  a ha-icon { --mdc-icon-size: 22px; }
  a[aria-current=page] { color: rgb(var(--ad-primary)); background: rgba(var(--ad-primary), 0.12); }
`

let bar: HTMLElement | undefined
let users = 0

function currentView() {
  return location.pathname.split('/')[2] ?? ''
}

export class AdNavBar extends BaseCard<NavBarConfig> {
  static styles = [tokens, css`
    :host { display: none; }
    @media (max-width: 768px) { :host { display: block; height: 72px; } }
  `]

  private onLocation = () => this.paint()

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
    }
    window.addEventListener('location-changed', this.onLocation)
    window.addEventListener('popstate', this.onLocation)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('location-changed', this.onLocation)
    window.removeEventListener('popstate', this.onLocation)
    // Defer, so switching views (old card leaves, new one joins) keeps the bar in place
    users--
    setTimeout(() => {
      if (users === 0 && bar) {
        bar.remove()
        bar = undefined
      }
    }, 0)
  }

  protected updated() {
    this.paint()
  }

  private paint() {
    if (!bar?.shadowRoot || !this.config) return
    bar.toggleAttribute('dark', this.hasAttribute('dark'))
    const active = currentView()
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
