// One primary color in, the whole palette out: background, surfaces and text take its hue (slightly tinted,
// like the slate default next to indigo), the accent is tuned for dark and light, info sits next to it.
// Warning, error and success keep their hues: amber means light on, red means alarm, whatever the accent.

/** Every variable the palette sets on a card host; removed again when the option goes away. */
export const PALETTE_VARS = [
  '--ad-bg', '--ad-surface', '--ad-surface-variant', '--ad-on-surface', '--ad-primary', '--ad-on-primary',
  '--ad-info', '--ad-shadow', '--ad-glass-bg', '--ad-glass-hi',
] as const

type Hsl = [h: number, s: number, l: number]

export function parseHex(hex: string): [r: number, g: number, b: number] | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return undefined
  const full = m[1]!.length === 3 ? [...m[1]!].map(c => c + c).join('') : m[1]!
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

export const isHexColor = (value: unknown): value is string => typeof value === 'string' && !!parseHex(value)

function toHsl([r, g, b]: [number, number, number]): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
  return [h * 60, s * 100, l * 100]
}

/** "r, g, b" triplet, the format the tokens use inside rgb()/rgba(). */
function triplet([h, s, l]: Hsl) {
  const sn = Math.max(0, Math.min(100, s)) / 100
  const ln = Math.max(0, Math.min(100, l)) / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => Math.round(255 * (ln - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
  return `${f(0)}, ${f(8)}, ${f(4)}`
}

/** Relative luminance (WCAG) of a triplet, to pick black or white text on the accent. */
function luminance(rgb: string) {
  const [r, g, b] = rgb.split(',').map(v => {
    const c = Number(v) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/**
 * CSS variables for one primary color. Saturation of the neutrals follows the primary, capped,
 * so a grey primary gives plain greys and a vivid one gives tinted surfaces like slate.
 */
export function paletteVars(hex: string, dark: boolean): Record<(typeof PALETTE_VARS)[number], string> | undefined {
  const rgb = parseHex(hex)
  if (!rgb) return undefined
  const [h, s] = toHsl(rgb)
  const tint = Math.min(s, 100) * 0.45
  const primary = triplet([h, Math.max(Math.min(s, 90), s > 8 ? 55 : s), dark ? 67 : 56])
  const info = triplet([(h + 340) % 360, Math.max(Math.min(s, 85), s > 8 ? 60 : s), dark ? 60 : 50])
  const onPrimary = luminance(primary) > 0.45 ? '15, 23, 42' : '255, 255, 255'
  if (dark) {
    const surface = triplet([h, tint * 0.75, 17])
    return {
      '--ad-bg': `rgb(${triplet([h, tint, 11])})`,
      '--ad-surface': `rgb(${surface})`,
      '--ad-surface-variant': `rgb(${triplet([h, tint * 0.6, 27])})`,
      '--ad-on-surface': triplet([h, tint * 0.9, 96]),
      '--ad-primary': primary,
      '--ad-on-primary': onPrimary,
      '--ad-info': info,
      '--ad-shadow': 'none',
      '--ad-glass-bg': `rgba(${surface}, 0.46)`,
      '--ad-glass-hi': 'rgba(255, 255, 255, 0.08)',
    }
  }
  return {
    '--ad-bg': `rgb(${triplet([h, tint, 98])})`,
    '--ad-surface': '#ffffff',
    '--ad-surface-variant': `rgb(${triplet([h, tint * 0.8, 96])})`,
    '--ad-on-surface': triplet([h, tint, 11]),
    '--ad-primary': primary,
    '--ad-on-primary': onPrimary,
    '--ad-info': info,
    '--ad-shadow': `0 10px 28px rgba(${triplet([h, tint * 0.4, 65])}, 0.08)`,
    '--ad-glass-bg': 'rgba(255, 255, 255, 0.56)',
    '--ad-glass-hi': 'rgba(255, 255, 255, 0.72)',
  }
}

/** The tokens' own page background, used when there is no accent to derive one from. */
const DEFAULT_BG = { dark: '#0f172a', light: '#f8fafc' }

const byTheme = (theme: 'auto' | 'dark' | 'light', dark: string, light: string) =>
  theme === 'dark' ? dark : theme === 'light' ? light : `light-dark(${light}, ${dark})`

/**
 * Backdrop for frosted glass. Glass only shows what lies behind it, and on a plain page there is nothing to see,
 * so the page gets one soft light from the upper left in a muted accent, like a lamp behind a frosted door.
 */
export function glassBackground(hex: string | undefined, theme: 'auto' | 'dark' | 'light' = 'auto') {
  const [h, s] = toHsl(parseHex(hex ?? '') ?? [99, 102, 241])
  const sat = Math.min(s, 35)
  const light = byTheme(theme, `rgba(${triplet([h, sat, 52])}, 0.22)`, `rgba(${triplet([h, sat, 72])}, 0.3)`)
  const base = (hex && pageBackground(hex, theme)) || byTheme(theme, DEFAULT_BG.dark, DEFAULT_BG.light)
  return `radial-gradient(90% 70% at 10% 0%, ${light}, transparent 70%), ${base}`
}

/**
 * A picture of one's own as the page background, like a phone's wallpaper behind its widgets. A veil in the
 * page color keeps text readable over bright or busy pictures; glass cards blur what lies behind them.
 */
export function imageBackground(url: string, hex: string | undefined, theme: 'auto' | 'dark' | 'light' = 'auto') {
  const rgb = (dark: boolean) => {
    const own = hex ? paletteVars(hex, dark)?.['--ad-bg'] : undefined
    return own ? own.slice(4, -1) : parseHex(dark ? DEFAULT_BG.dark : DEFAULT_BG.light)!.join(', ')
  }
  const veil = byTheme(theme, `rgba(${rgb(true)}, 0.45)`, `rgba(${rgb(false)}, 0.35)`)
  const base = byTheme(theme, `rgb(${rgb(true)})`, `rgb(${rgb(false)})`)
  // Quotes, backslashes and line breaks would end the CSS string early
  const src = url.trim().replace(/[\n\r]/g, '').replace(/["\\]/g, c => `\\${c}`)
  return `linear-gradient(${veil}, ${veil}), url("${src}") center / cover no-repeat, ${base}`
}

/**
 * View background matching the palette. HA sets color-scheme from its dark mode,
 * so with theme auto light-dark() follows HA without regenerating the dashboard.
 */
export function pageBackground(hex: string, theme: 'auto' | 'dark' | 'light' = 'auto') {
  const dark = paletteVars(hex, true)?.['--ad-bg']
  const light = paletteVars(hex, false)?.['--ad-bg']
  if (!dark || !light) return undefined
  return byTheme(theme, dark, light)
}

/** Set the palette on an element, or clear it when there is none. */
export function applyPalette(el: HTMLElement, vars: Record<string, string> | undefined) {
  for (const name of PALETTE_VARS) {
    if (vars) el.style.setProperty(name, vars[name]!)
    else el.style.removeProperty(name)
  }
}

/**
 * HA's own theme variables from the same palette, so the header, sidebar and HA's dialogs
 * (more-info, editors) match the cards. Same names as themes/harmony.yaml.
 */
export function haThemeVars(hex: string, dark: boolean): Record<string, string> | undefined {
  const p = paletteVars(hex, dark)
  if (!p) return undefined
  const text = p['--ad-on-surface']
  const primary = `rgb(${p['--ad-primary']})`
  return {
    '--primary-color': primary,
    '--accent-color': primary,
    '--primary-background-color': p['--ad-bg'],
    '--lovelace-background': p['--ad-bg'],
    '--secondary-background-color': p['--ad-surface-variant'],
    '--card-background-color': p['--ad-surface'],
    '--ha-card-background': p['--ad-surface'],
    '--primary-text-color': `rgb(${text})`,
    '--secondary-text-color': `rgba(${text}, 0.62)`,
    '--divider-color': `rgba(${text}, 0.08)`,
    '--app-header-background-color': p['--ad-bg'],
    '--app-header-text-color': `rgb(${text})`,
    '--sidebar-background-color': p['--ad-bg'],
    '--sidebar-text-color': `rgba(${text}, 0.8)`,
    '--sidebar-icon-color': `rgba(${text}, 0.6)`,
    '--sidebar-selected-text-color': primary,
    '--sidebar-selected-icon-color': primary,
    '--mdc-theme-primary': primary,
    '--state-icon-active-color': primary,
  }
}

/**
 * HA's own cards on the dashboard (history graph, todo list, camera) as frosted glass like ours.
 * ha-card reads its background, blur, edge and corners from these variables.
 */
export function haGlassVars(hex: string | undefined, dark: boolean): Record<string, string> {
  const own = hex ? paletteVars(hex, dark)?.['--ad-glass-bg'] : undefined
  return {
    '--ha-card-background': own ?? (dark ? 'rgba(30, 41, 59, 0.46)' : 'rgba(255, 255, 255, 0.56)'),
    '--ha-card-backdrop-filter': 'blur(30px) saturate(140%)',
    '--ha-card-border-color': dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
    '--ha-card-box-shadow': dark ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08)' : '0 8px 24px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.72)',
    '--ha-card-border-radius': '24px',
  }
}
