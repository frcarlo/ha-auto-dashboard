// Renders the generated dashboard roughly like HA's sections view, against mock data.
import * as mdi from '@mdi/js'
import '../src/index'
import { generateDashboard } from '../src/strategy'
import { applyService, createHass } from './mock'
import type { HomeAssistant, StrategyConfig } from '../src/types'

// Stand-ins for HA's own icon elements. Shadow DOM like the real ones: light-DOM
// children would shift Lit's part indices while a template is being cloned.
class HaIcon extends HTMLElement {
  static observedAttributes = ['icon']
  attributeChangedCallback() { this.paint() }
  set icon(v: string) { this.setAttribute('icon', v) }
  connectedCallback() { this.paint() }
  paint() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    const name = (this.getAttribute('icon') ?? '').replace(/^mdi:/, '')
    const key = 'mdi' + name.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
    const path = (mdi as Record<string, string>)[key] ?? mdi.mdiHelpCircleOutline
    const size = 'var(--mdc-icon-size, 24px)'
    root.innerHTML = `<style>:host{display:inline-flex}</style><svg viewBox="0 0 24 24" style="width:${size};height:${size};fill:currentColor"><path d="${path}"/></svg>`
  }
}
customElements.define('ha-icon', HaIcon)
customElements.define('ha-state-icon', class extends HaIcon {
  connectedCallback() { this.setAttribute('icon', 'mdi:weather-partly-cloudy') }
})

const params = new URLSearchParams(location.search)
let dark = params.get('theme') !== 'light'
const list = (key: string) => params.get(key)?.split(',').filter(Boolean)
const config: StrategyConfig = {
  type: 'custom:auto-dashboard',
  glass: params.has('glass'),
  // The dryer only has a smart plug, so it is set up by hand like in a real config
  appliances: [{ status: 'sensor.trockner_leistung', name: 'Trockner' }],
  // ?bg=/dev/some.jpg
  background_image: params.get('bg') ?? undefined,
  areas: list('areas'),
  floors: list('floors'),
  hide_labels: list('labels'),
  outdoor_areas: list('outdoor'),
  // ?primary=0ea5e9 (without #, it would start the URL fragment)
  primary_color: params.get('primary') ? `#${params.get('primary')}` : undefined,
  // ?fav=light.flur,lock.eingangstur  ?scenes=script.gute_nacht,scene.wohnzimmer_kino
  favorites: list('fav'),
  scenes: list('scenes'),
  // ?warnings=binary_sensor.warning_mulheim_1&warn=on   ?days=5
  weather_warnings: list('warnings'),
  forecast_days: params.has('days') ? Number(params.get('days')) : undefined,
  weather_sensors: params.has('sensors') ? {
    temperature: 'sensor.aussen_temperatur', humidity: 'sensor.aussen_luftfeuchte', illuminance: 'sensor.aussen_helligkeit', rain: 'sensor.aussen_regen',
  } : undefined,
  nav_position: (params.get('nav') ?? undefined) as StrategyConfig['nav_position'],
  // ?face=analog&after=3 shows that face after three seconds without a touch
  face: params.has('face') ? { after: Number(params.get('after') ?? 3), style: (params.get('face') || 'clock') as NonNullable<StrategyConfig['face']>['style'] } : undefined,
  // ?as=leni&users={"leni":{"access":"read_only"}} views the dashboard as a non-admin with that rule
  users: params.has('users') ? JSON.parse(params.get('users')!) : undefined,
}
let hass: HomeAssistant = createHass(dark)
if (params.get('warn') === 'on') {
  hass.states['binary_sensor.warning_mulheim_1'] = {
    entity_id: 'binary_sensor.warning_mulheim_1', state: 'on',
    attributes: { friendly_name: 'Warnung Mülheim 1', headline: 'Amtliche WARNUNG vor STURMBÖEN', severity: 'Moderate', expires: new Date(Date.now() + 6 * 3600_000).toISOString() },
  }
}
if (params.has('as')) hass.user = { id: 'harness', name: params.get('as')!, is_admin: false }
let views: any[] = []
const cards: any[] = []

hass.callService = callService
async function callService(domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>) {
  toast(`${domain}.${service} → ${JSON.stringify(target?.entity_id)}`)
  hass = { ...applyService(hass, domain, service, data, target), callService }
  for (const card of cards) card.hass = hass
}

// Adding and deleting lists like HA's Local To-do integration: a config flow adds one, deleting its entry removes it
const baseApi = hass.callApi!
const baseWS = hass.callWS!
function setLists(change: (states: HomeAssistant['states'], entities: HomeAssistant['entities']) => void) {
  const states = { ...hass.states }
  const entities = { ...hass.entities }
  change(states, entities)
  hass = { ...hass, states, entities }
  for (const card of cards) card.hass = hass
}
hass.callApi = async <T,>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) => {
  if (path === 'config/config_entries/flow') return { type: 'form', flow_id: 'f1' } as T
  if (path.startsWith('config/config_entries/flow/')) {
    const name = String(body?.todo_list_name ?? '')
    const id = `todo.${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
    if (hass.states[id]) return { type: 'abort', reason: 'already_configured' } as T
    setTimeout(() => setLists((states, entities) => {
      states[id] = { entity_id: id, state: '0', attributes: { friendly_name: name } }
      entities[id] = { entity_id: id, platform: 'local_todo', labels: [] }
    }), 300)
    return { type: 'create_entry' } as T
  }
  return baseApi<T>(method, path, body)
}
hass.callWS = async <T,>(msg: Record<string, unknown>) => {
  if (msg.type === 'config/entity_registry/get') return { config_entry_id: `entry-${msg.entity_id}` } as T
  if (msg.type === 'config_entries/delete') {
    const id = String(msg.entry_id).replace('entry-', '')
    setTimeout(() => setLists((states, entities) => { delete states[id]; delete entities[id] }), 300)
    return { require_restart: false } as T
  }
  return baseWS<T>(msg)
}

function toast(text: string) {
  const el = document.getElementById('toast')!
  el.textContent = text
  el.style.opacity = '1'
  clearTimeout((el as any).t)
  ;(el as any).t = setTimeout(() => (el.style.opacity = '0'), 1600)
}

window.addEventListener('hass-more-info', (e: any) => toast(`more-info: ${e.detail.entityId}`))
window.addEventListener('location-changed', () => render())
window.addEventListener('popstate', () => render())
window.addEventListener('resize', () => render())

function currentPath() {
  const p = location.pathname.split('/')[2] ?? ''
  return views.some(v => v.path === p) ? p : views[0].path
}

function go(path: string) {
  history.pushState(null, '', `/dev/${path}${location.search}`)
  render()
}

function createCard(conf: any) {
  if (conf.type === 'heading') {
    const el = document.createElement('div')
    el.className = `heading ${conf.heading_style ?? ''}`
    el.innerHTML = `${conf.icon ? `<ha-icon icon="${conf.icon}"></ha-icon>` : ''}<span>${conf.heading}</span>`
    if (conf.tap_action) {
      el.dataset.nav = ''
      el.onclick = () => go(conf.tap_action.navigation_path.split('/')[2])
    }
    return { el, options: { columns: 'full', rows: 'auto' } }
  }
  // HA's own cards (camera, to-do list, statistics graph) only get a placeholder here
  if (!conf.type.startsWith('custom:')) {
    const el = document.createElement('div')
    el.className = 'placeholder'
    el.textContent = `${conf.type}: ${conf.entity ?? conf.entities?.join(', ') ?? ''}`
    return { el, options: { columns: conf.grid_options?.columns ?? 12, rows: conf.grid_options?.rows ?? 'auto' } }
  }
  const el: any = document.createElement(conf.type.replace('custom:', ''))
  el.setConfig(conf)
  el.hass = hass
  cards.push(el)
  return { el, options: el.getGridOptions?.() ?? { columns: 12, rows: 'auto' } }
}

function render() {
  cards.length = 0
  const path = currentPath()
  const view = views.find(v => v.path === path)
  const tabs = document.getElementById('tabs')!
  tabs.innerHTML = ''
  if (view.subview) {
    const back = document.createElement('button')
    back.textContent = '← Zurück'
    back.onclick = () => go('home')
    tabs.append(back)
  }
  for (const v of views.filter(v => !v.subview)) {
    const b = document.createElement('button')
    b.textContent = v.title
    b.setAttribute('aria-current', String(v.path === path))
    b.onclick = () => go(v.path)
    tabs.append(b)
  }
  tabs.append(Object.assign(document.createElement('span'), { className: 'spacer' }))
  const themeBtn = document.createElement('button')
  themeBtn.textContent = dark ? 'Hell' : 'Dunkel'
  themeBtn.onclick = () => { dark = !dark; hass = { ...hass, themes: { darkMode: dark } }; document.body.classList.toggle('light', !dark); render() }
  tabs.append(themeBtn)

  const main = document.getElementById('view')!
  main.innerHTML = ''
  // Like hui-view-background; color-scheme stands in for the one HA sets from its dark mode
  const bg = view.background
  if (typeof bg === 'object' && bg) {
    // HA's object form: the picture drawn at its opacity over the page color, approximated with a veil of that color
    const veil = `color-mix(in srgb, ${dark ? '#0f172a' : '#f8fafc'} ${100 - (bg.opacity ?? 100)}%, transparent)`
    main.style.background = `linear-gradient(${veil}, ${veil}), ${bg.alignment ?? 'center'} / ${bg.size ?? 'cover'} ${bg.repeat ?? 'no-repeat'} url('${bg.image}'), ${dark ? '#0f172a' : '#f8fafc'}`
  } else main.style.background = bg ?? ''
  main.style.colorScheme = dark ? 'dark' : 'light'
  const width = main.clientWidth || window.innerWidth
  const cols = Math.max(1, Math.min(view.max_columns ?? 4, Math.floor((width - 32 + 8) / (320 + 8))))
  // Same tag as HA's view, so the nav bar finds it to make room for a side rail
  const grid = document.createElement('hui-sections-view')
  grid.className = 'view'
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`
  for (const section of view.sections) {
    const span = Math.min(section.column_span ?? 1, cols)
    const gridCols = 12 * span
    const s = document.createElement('div')
    s.className = 'section'
    s.style.gridColumn = `span ${span}`
    s.style.gridTemplateColumns = `repeat(${gridCols}, minmax(0, 1fr))`
    for (const conf of section.cards) {
      const { el, options } = createCard(conf)
      const c = options.columns === 'full' ? gridCols : Math.min(Number(options.columns), gridCols)
      // Like HA's hui-card wrapper: the cell gets the size, the card has to fill it itself
      const cell = document.createElement('div')
      cell.style.gridColumn = `span ${c}`
      if (options.rows !== 'auto') cell.style.height = `${options.rows * 56 + (options.rows - 1) * 8}px`
      if (options.rows !== 'auto') cell.style.gridRow = `span ${options.rows}`
      cell.append(el)
      s.append(cell)
    }
    grid.append(s)
  }
  main.append(grid)
}

document.body.classList.toggle('light', !dark)

// ?editor shows the strategy's config editor and the config it would save
if (params.has('editor')) {
  const main = document.getElementById('view')!
  main.style.cssText = 'max-width:560px;margin:24px auto;padding:0 16px'
  const editor: any = document.createElement('ad-strategy-editor')
  editor.setConfig({ type: 'custom:auto-dashboard' })
  editor.hass = hass
  const out = document.createElement('pre')
  out.id = 'saved'
  out.style.cssText = 'font-size:12px;opacity:.7;white-space:pre-wrap'
  editor.addEventListener('config-changed', (e: any) => { out.textContent = JSON.stringify(e.detail.config, null, 2) })
  main.append(editor, out)
} else generateDashboard(config, hass).then(result => {
  views = result.views
  render()
})
