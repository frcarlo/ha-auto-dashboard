// A scene button in the light it makes: the colour its lights get, read from the scene's own configuration.
// HA keeps that configuration from all but admins, so only they see the colours; the others the plain button.
import { domainOf } from './presentation'
import type { HomeAssistant } from './types'

export type Rgb = [number, number, number]

/** What a scene sets on one entity, as HA stores it under config/scene/config/<id> */
type Target = { state?: string; rgb_color?: number[]; hs_color?: number[]; color_temp_kelvin?: number; color_temp?: number; brightness?: number }

/** White light of a colour temperature, the way bulbs show it (Tanner Helland's approximation) */
export function kelvinToRgb(kelvin: number): Rgb {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100
  const clamp = (v: number) => Math.round(Math.min(255, Math.max(0, v)))
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  return [clamp(r), clamp(g), clamp(b)]
}

/** Hue (0–360) and saturation (0–100) at full brightness */
export function hsToRgb(h: number, s: number): Rgb {
  const sat = Math.min(100, Math.max(0, s)) / 100
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round(255 * (1 - sat * Math.max(0, Math.min(k, 4 - k, 1))))
  }
  return [f(5), f(3), f(1)]
}

function targetRgb(target: Target): Rgb | undefined {
  if (target.rgb_color?.length === 3) return target.rgb_color as Rgb
  if (target.hs_color?.length === 2) return hsToRgb(target.hs_color[0]!, target.hs_color[1]!)
  if (target.color_temp_kelvin) return kelvinToRgb(target.color_temp_kelvin)
  if (target.color_temp) return kelvinToRgb(1_000_000 / target.color_temp)
  return undefined
}

/**
 * The colour of a scene's light: the mean of the colours its lights are set to, brighter lights counting more.
 * 'off' when it only switches lights off, undefined when it sets no light or no colour.
 */
export function sceneTint(entities: Record<string, Target> = {}): Rgb | 'off' | undefined {
  const lights = Object.entries(entities).filter(([id]) => domainOf(id) === 'light')
  if (!lights.length) return undefined
  const on = lights.filter(([, t]) => t.state === 'on')
  if (!on.length) return 'off'
  let weight = 0
  const sum: Rgb = [0, 0, 0]
  for (const [, t] of on) {
    const rgb = targetRgb(t)
    if (!rgb) continue
    const w = Math.max(1, t.brightness ?? 255)
    weight += w
    for (let i = 0; i < 3; i++) sum[i]! += rgb[i]! * w
  }
  return weight ? sum.map(v => Math.round(v / weight)) as Rgb : undefined
}

/** Black or white, whichever reads on the colour */
export const onTint = ([r, g, b]: Rgb) => (0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#000' : '#fff')

const tints = new Map<string, Rgb | 'off' | null>()
const loading = new Set<string>()

/** The tint of a scene once loaded; null when it has none or cannot be read */
export const tintOf = (sceneId: string) => tints.get(sceneId)

/** Reads the configuration of the scenes not known yet, for admins only; resolves true when something new came in */
export async function loadSceneTints(hass: HomeAssistant, sceneIds: string[]): Promise<boolean> {
  if (!hass.user?.is_admin || !hass.callApi) return false
  const todo = sceneIds.filter(id => domainOf(id) === 'scene' && !tints.has(id) && !loading.has(id) && hass.states[id]?.attributes.id)
  if (!todo.length) return false
  todo.forEach(id => loading.add(id))
  await Promise.all(todo.map(async id => {
    try {
      const config = await hass.callApi!<{ entities?: Record<string, Target> }>('GET', `config/scene/config/${hass.states[id]!.attributes.id}`)
      tints.set(id, sceneTint(config?.entities) ?? null)
    } catch {
      // A scene from YAML or one HA won't show: the plain button
      tints.set(id, null)
    } finally {
      loading.delete(id)
    }
  }))
  return true
}

/** For tests */
export function clearSceneTints() {
  tints.clear()
  loading.clear()
}
