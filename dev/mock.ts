// Fake Home Assistant for the dev harness: registries, states and a callService that mutates them.
import type { HassEntity, HomeAssistant } from '../src/types'

type Def = [entityId: string, state: string, attributes: Record<string, unknown>, area: string, extra?: Record<string, unknown>]

const defs: Def[] = [
  ['light.wohnzimmer_decke', 'on', { friendly_name: 'Wohnzimmer Decke', brightness: 180, supported_color_modes: ['brightness'] }, 'wohnzimmer'],
  ['light.wohnzimmer_stehlampe', 'off', { friendly_name: 'Stehlampe', supported_color_modes: ['color_temp'] }, 'wohnzimmer'],
  ['climate.wohnzimmer', 'heat', { friendly_name: 'Wohnzimmer Thermostat', current_temperature: 21.4, temperature: 22, hvac_action: 'heating', target_temp_step: 0.5 }, 'wohnzimmer'],
  ['sensor.wohnzimmer_temperatur', '21.3', { friendly_name: 'Wohnzimmer Temperatur', device_class: 'temperature', unit_of_measurement: '°C' }, 'wohnzimmer'],
  ['sensor.wohnzimmer_luftfeuchte', '48', { friendly_name: 'Wohnzimmer Luftfeuchte', device_class: 'humidity', unit_of_measurement: '%' }, 'wohnzimmer'],
  ['sensor.wohnzimmer_co2', '612', { friendly_name: 'Wohnzimmer CO2', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }, 'wohnzimmer'],
  ['binary_sensor.wohnzimmer_fenster', 'on', { friendly_name: 'Wohnzimmer Fenster', device_class: 'window' }, 'wohnzimmer'],
  ['media_player.wohnzimmer_sonos', 'playing', { friendly_name: 'Wohnzimmer Sonos', media_title: 'Teardrop', media_artist: 'Massive Attack' }, 'wohnzimmer'],
  ['cover.wohnzimmer_rollo', 'open', { friendly_name: 'Wohnzimmer Rollo', current_position: 70 }, 'wohnzimmer'],
  ['switch.wohnzimmer_steckdose', 'off', { friendly_name: 'Wohnzimmer Steckdose', device_class: 'outlet' }, 'wohnzimmer'],
  ['scene.wohnzimmer_kino', 'scening', { friendly_name: 'Wohnzimmer Kino' }, 'wohnzimmer'],

  ['light.kuche', 'off', { friendly_name: 'Küche Licht', supported_color_modes: ['brightness'] }, 'kuche'],
  ['light.kuche_theke', 'off', { friendly_name: 'Küche Theke', supported_color_modes: ['onoff'] }, 'kuche'],
  ['sensor.kuche_temperatur', '20.1', { friendly_name: 'Küche Temperatur', device_class: 'temperature', unit_of_measurement: '°C' }, 'kuche'],
  ['binary_sensor.kuche_fenster', 'off', { friendly_name: 'Küche Fenster', device_class: 'window' }, 'kuche'],
  ['switch.kuche_kaffee', 'on', { friendly_name: 'Kaffeemaschine', device_class: 'outlet' }, 'kuche'],

  ['light.esszimmer', 'on', { friendly_name: 'Esszimmer', brightness: 90, supported_color_modes: ['brightness'] }, 'esszimmer'],
  ['cover.esszimmer', 'closed', { friendly_name: 'Esszimmer Rollo', current_position: 0 }, 'esszimmer'],

  ['lock.eingangstur', 'locked', { friendly_name: 'Haustür' }, 'eingangstur'],
  ['binary_sensor.eingangstur_kontakt', 'off', { friendly_name: 'Haustür Kontakt', device_class: 'door' }, 'eingangstur'],
  ['binary_sensor.flur_bewegung', 'on', { friendly_name: 'Flur Bewegung', device_class: 'motion' }, 'flur'],
  ['light.flur', 'off', { friendly_name: 'Flur', supported_color_modes: ['onoff'] }, 'flur'],

  ['light.schlafzimmer', 'off', { friendly_name: 'Schlafzimmer Licht', supported_color_modes: ['brightness'] }, 'schlafzimmer'],
  ['climate.schlafzimmer', 'heat', { friendly_name: 'Schlafzimmer Thermostat', current_temperature: 18.2, temperature: 18.5, hvac_action: 'idle' }, 'schlafzimmer'],
  ['binary_sensor.schlafzimmer_fenster', 'off', { friendly_name: 'Schlafzimmer Fenster', device_class: 'window' }, 'schlafzimmer'],
  ['sensor.schlafzimmer_luftfeuchte', '55', { friendly_name: 'Schlafzimmer Luftfeuchte', device_class: 'humidity', unit_of_measurement: '%' }, 'schlafzimmer'],
  ['cover.schlafzimmer', 'closed', { friendly_name: 'Schlafzimmer Rollo', current_position: 0 }, 'schlafzimmer'],

  ['light.bad', 'off', { friendly_name: 'Bad Spiegel', supported_color_modes: ['onoff'] }, 'bad'],
  ['climate.bad', 'off', { friendly_name: 'Bad Heizung', current_temperature: 19.8, temperature: 21 }, 'bad'],
  ['sensor.bad_luftfeuchte', '71', { friendly_name: 'Bad Luftfeuchte', device_class: 'humidity', unit_of_measurement: '%' }, 'bad'],

  ['light.buro_keller', 'on', { friendly_name: 'Büro Keller Schreibtisch', brightness: 255, supported_color_modes: ['brightness'] }, 'buro_keller'],
  ['sensor.buro_keller_leistung', '142.6', { friendly_name: 'Büro Keller Leistung', device_class: 'power', unit_of_measurement: 'W' }, 'buro_keller'],
  ['switch.buro_keller_drucker', 'unavailable', { friendly_name: 'Drucker' }, 'buro_keller'],

  ['light.garage', 'off', { friendly_name: 'Garage', supported_color_modes: ['onoff'] }, 'garage'],
  ['binary_sensor.garage_tor', 'on', { friendly_name: 'Garagentor', device_class: 'garage_door' }, 'garage'],
]

const extras: HassEntity[] = [
  { entity_id: 'sensor.flur_batterie', state: '9', attributes: { friendly_name: 'Flur Bewegungsmelder Batterie', device_class: 'battery', unit_of_measurement: '%' } },
  { entity_id: 'weather.home', state: 'partlycloudy', attributes: { friendly_name: 'Zuhause', temperature: 11.2, temperature_unit: '°C' } },
]

export function createHass(dark: boolean): HomeAssistant {
  const states: Record<string, HassEntity> = {}
  const entities: HomeAssistant['entities'] = {}
  for (const [entity_id, state, attributes, area] of defs) {
    states[entity_id] = { entity_id, state, attributes }
    entities[entity_id] = { entity_id, area_id: area, labels: [] }
  }
  // ?labels=technik hides these
  entities['switch.kuche_kaffee']!.labels = ['technik']
  entities['sensor.buro_keller_leistung']!.labels = ['technik']
  for (const e of extras) {
    states[e.entity_id] = e
    entities[e.entity_id] = { entity_id: e.entity_id, entity_category: e.entity_id.startsWith('sensor.') ? 'diagnostic' : null }
  }

  const hass: HomeAssistant = {
    states,
    entities,
    devices: {},
    areas: {
      wohnzimmer: { area_id: 'wohnzimmer', name: 'Wohnzimmer', icon: 'mdi:sofa', floor_id: 'eg' },
      kuche: { area_id: 'kuche', name: 'Küche', icon: 'mdi:countertop', floor_id: 'eg' },
      esszimmer: { area_id: 'esszimmer', name: 'Esszimmer', icon: 'mdi:table-chair', floor_id: 'eg' },
      eingangstur: { area_id: 'eingangstur', name: 'Eingangstür', icon: 'mdi:door', floor_id: 'eg' },
      schlafzimmer: { area_id: 'schlafzimmer', name: 'Schlafzimmer', icon: 'mdi:bed', floor_id: 'og' },
      bad: { area_id: 'bad', name: 'Bad', icon: 'mdi:bathtub', floor_id: 'og' },
      buro_keller: { area_id: 'buro_keller', name: 'Büro Keller', icon: 'mdi:chair-rolling', floor_id: 'keller' },
      flur: { area_id: 'flur', name: 'Flur', icon: null },
      garage: { area_id: 'garage', name: 'Garage', icon: 'mdi:garage' },
    },
    floors: {
      keller: { floor_id: 'keller', name: 'Keller', level: -1, icon: 'mdi:home-floor-b' },
      eg: { floor_id: 'eg', name: 'Erdgeschoss', level: 0, icon: 'mdi:home-floor-0' },
      og: { floor_id: 'og', name: 'Obergeschoss', level: 1, icon: 'mdi:home-floor-1' },
    },
    themes: { darkMode: dark },
    language: 'de',
    locale: { language: 'de' },
    user: { id: 'u-frank', name: 'Frank Carlo', is_admin: true },
    formatEntityState: (e: HassEntity) => {
      const map: Record<string, string> = {
        on: 'An', off: 'Aus', open: 'Offen', closed: 'Geschlossen', locked: 'Verriegelt', unlocked: 'Entriegelt',
        playing: 'Spielt', paused: 'Pausiert', heat: 'Heizen', partlycloudy: 'Teilweise bewölkt', unavailable: 'Nicht verfügbar',
      }
      const unit = e.attributes.unit_of_measurement
      return map[e.state] ?? (unit ? `${e.state} ${unit}` : e.state)
    },
    callService: async () => undefined,
    callWS: async <T,>(msg: Record<string, unknown>) => {
      if (msg.type === 'config/label_registry/list') return [
        { label_id: 'ad_hide', name: 'ad_hide' },
        { label_id: 'technik', name: 'Technik' },
        { label_id: 'gast', name: 'Gast' },
      ] as T
      if (msg.type !== 'config/auth/list') throw new Error(`mock: ${msg.type}`)
      return [
        { id: 'u-frank', name: 'Frank Carlo', system_generated: false, is_active: true, group_ids: ['system-admin'] },
        { id: 'u-leni', name: 'Leni', system_generated: false, is_active: true, group_ids: ['system-users'] },
        { id: 'u-gast', name: 'Gast', system_generated: false, is_active: true, group_ids: ['system-users'] },
        { id: 'u-sup', name: 'Supervisor', system_generated: true, is_active: true, group_ids: ['system-admin'] },
      ] as T
    },
  }
  return hass
}

/** Applies a service call to the fake states, so the harness reacts like HA would. */
export function applyService(hass: HomeAssistant, domain: string, service: string, data: Record<string, any> = {}, target: Record<string, any> = {}): HomeAssistant {
  const ids: string[] = [].concat(target.entity_id ?? [])
  const states = { ...hass.states }
  for (const id of ids) {
    const e = states[id]
    if (!e) continue
    let { state } = e
    const attributes = { ...e.attributes }
    if (service === 'toggle') state = state === 'on' ? 'off' : 'on'
    if (service === 'turn_on') state = 'on'
    if (service === 'turn_off') state = 'off'
    if (domain === 'light' && data.brightness_pct) { state = 'on'; attributes.brightness = Math.round(data.brightness_pct * 2.55) }
    if (domain === 'light' && service === 'turn_on' && !attributes.brightness) attributes.brightness = 255
    if (domain === 'climate' && data.temperature !== undefined) attributes.temperature = data.temperature
    if (domain === 'cover') {
      if (service === 'open_cover') { state = 'open'; attributes.current_position = 100 }
      if (service === 'close_cover') { state = 'closed'; attributes.current_position = 0 }
    }
    if (domain === 'lock') state = service === 'lock' ? 'locked' : 'unlocked'
    if (domain === 'media_player' && service === 'media_play_pause') state = state === 'playing' ? 'paused' : 'playing'
    states[id] = { ...e, state, attributes }
  }
  return { ...hass, states }
}
