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
  ['media_player.wohnzimmer_sonos', 'playing', { friendly_name: 'Wohnzimmer Sonos', media_title: 'Teardrop', media_artist: 'Massive Attack', supported_features: 16417 }, 'wohnzimmer'],
  ['cover.wohnzimmer_dachfenster', 'closed', { friendly_name: 'Wohnzimmer Dachfenster', device_class: 'window', current_position: 0 }, 'wohnzimmer'],
  ['cover.wohnzimmer_rollo', 'open', { friendly_name: 'Wohnzimmer Rollo', current_position: 70 }, 'wohnzimmer'],
  ['switch.wohnzimmer_steckdose', 'off', { friendly_name: 'Wohnzimmer Steckdose', device_class: 'outlet' }, 'wohnzimmer'],
  ['scene.wohnzimmer_kino', new Date(Date.now() - 2 * 3600_000).toISOString(), { friendly_name: 'Wohnzimmer Kino' }, 'wohnzimmer'],
  ['scene.esszimmer_abendessen', new Date(Date.now() - 26 * 3600_000).toISOString(), { friendly_name: 'Abendessen', icon: 'mdi:silverware-fork-knife' }, 'esszimmer'],

  ['light.kuche', 'off', { friendly_name: 'Küche Licht', supported_color_modes: ['brightness'] }, 'kuche'],
  ['light.kuche_theke', 'off', { friendly_name: 'Küche Theke', supported_color_modes: ['onoff'] }, 'kuche'],
  ['sensor.kuche_temperatur', '20.1', { friendly_name: 'Küche Temperatur', device_class: 'temperature', unit_of_measurement: '°C' }, 'kuche'],
  ['binary_sensor.kuche_fenster', 'off', { friendly_name: 'Küche Fenster', device_class: 'window' }, 'kuche'],
  ['media_player.kuche_radio', 'paused', { friendly_name: 'Küche Radio', app_name: 'Radio Bremen', supported_features: 16417 }, 'kuche'],
  ['switch.kuche_kaffee', 'on', { friendly_name: 'Kaffeemaschine', device_class: 'outlet' }, 'kuche'],

  ['light.esszimmer', 'on', { friendly_name: 'Esszimmer', brightness: 90, supported_color_modes: ['brightness'] }, 'esszimmer'],
  ['cover.esszimmer', 'closed', { friendly_name: 'Esszimmer Rollo', current_position: 0 }, 'esszimmer'],
  ['cover.esszimmer_markise', 'open', { friendly_name: 'Esszimmer Markise', device_class: 'awning', current_position: 60 }, 'esszimmer'],

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
  ['sensor.buro_keller_leistung', '142.6', { friendly_name: 'Büro Keller Leistung', device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' }, 'buro_keller'],
  ['sensor.buro_keller_pc', '86', { friendly_name: 'Büro Keller PC', device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' }, 'buro_keller'],
  ['sensor.kuche_backofen', '1.85', { friendly_name: 'Küche Backofen', device_class: 'power', unit_of_measurement: 'kW', state_class: 'measurement' }, 'kuche'],
  ['sensor.wohnzimmer_tv_leistung', '96', { friendly_name: 'Wohnzimmer TV Leistung', device_class: 'power', unit_of_measurement: 'W' }, 'wohnzimmer'],
  ['camera.garage', 'idle', { friendly_name: 'Garage Kamera' }, 'garage'],
  ['todo.einkauf', '3', { friendly_name: 'Einkaufsliste' }, 'kuche'],
  ['todo.werkstatt', '0', { friendly_name: 'Werkstatt' }, 'garage'],
  ['sensor.garten_temperatur', '9.4', { friendly_name: 'Garten Temperatur', device_class: 'temperature', unit_of_measurement: '°C' }, 'garten'],
  ['sensor.garten_luftfeuchte', '82', { friendly_name: 'Garten Luftfeuchte', device_class: 'humidity', unit_of_measurement: '%' }, 'garten'],
  ['switch.buro_keller_drucker', 'unavailable', { friendly_name: 'Drucker' }, 'buro_keller'],

  ['light.garage', 'off', { friendly_name: 'Garage', supported_color_modes: ['onoff'] }, 'garage'],
  ['binary_sensor.garage_tor', 'on', { friendly_name: 'Garagentor', device_class: 'garage_door' }, 'garage'],
  ['cover.garage_tor', 'open', { friendly_name: 'Garagentorantrieb', device_class: 'garage' }, 'garage'],
  ['binary_sensor.garage_rauch', 'off', { friendly_name: 'Garage Rauchmelder', device_class: 'smoke' }, 'garage'],
]

type DeviceDef = { id: string; name: string; model?: string; area: string; platform?: string; entities: [entityId: string, state: string, attributes: Record<string, unknown>, platform?: string][] }

const PROGRAMS = ['dishcare_dishwasher_program_eco_50', 'dishcare_dishwasher_program_auto_2', 'dishcare_dishwasher_program_quick_45']
const ENUM = (options: string[]) => ({ device_class: 'enum', options })

// Appliances and a TV as their integrations bring them: one device with many entities each
const deviceDefs: DeviceDef[] = [
  {
    id: 'dev-geschirrspuler', name: 'Geschirrspüler', model: 'SN53ES14VE', area: 'kuche', platform: 'home_connect', entities: [
      ['sensor.geschirrspuler_betriebszustand', 'run', { friendly_name: 'Geschirrspüler Betriebszustand', ...ENUM(['inactive', 'ready', 'delayedstart', 'run', 'pause', 'actionrequired', 'finished', 'error', 'aborting']) }],
      ['sensor.geschirrspuler_programm_fortschritt', '62', { friendly_name: 'Geschirrspüler Programm-Fortschritt', unit_of_measurement: '%' }],
      ['sensor.geschirrspuler_programm_endzeit', new Date(Date.now() + 48 * 60_000).toISOString(), { friendly_name: 'Geschirrspüler Programm-Endzeit', device_class: 'timestamp' }],
      ['select.geschirrspuler_aktives_programm', PROGRAMS[0]!, { friendly_name: 'Geschirrspüler Aktives Programm', options: PROGRAMS }],
      ['select.geschirrspuler_ausgewahltes_programm', PROGRAMS[0]!, { friendly_name: 'Geschirrspüler Ausgewähltes Programm', options: PROGRAMS }],
      ['sensor.geschirrspuler_tur', 'closed', { friendly_name: 'Geschirrspüler Tür', ...ENUM(['closed', 'locked', 'open']) }],
      ['sensor.geschirrspuler_salz_fast_leer', 'present', { friendly_name: 'Geschirrspüler Salz fast leer', ...ENUM(['confirmed', 'off', 'present']) }],
      ['sensor.geschirrspuler_klarspuler_fast_leer', 'off', { friendly_name: 'Geschirrspüler Klarspüler fast leer', ...ENUM(['confirmed', 'off', 'present']) }],
      ['switch.geschirrspuler_intensivzone', 'off', { friendly_name: 'Geschirrspüler Intensivzone' }],
    ],
  },
  {
    id: 'dev-waschmaschine', name: 'Waschmaschine', area: 'waschkeller', platform: 'washdata', entities: [
      ['sensor.waschmaschine_zustand', 'finished', { friendly_name: 'Waschmaschine Zustand', ...ENUM(['off', 'idle', 'starting', 'running', 'paused', 'ending', 'finished', 'anti_wrinkle']) }],
      ['sensor.waschmaschine_fortschritt', '100', { friendly_name: 'Waschmaschine Fortschritt', unit_of_measurement: '%' }],
      ['sensor.waschmaschine_verbleibende_zeit', '0', { friendly_name: 'Waschmaschine Verbleibende Zeit', device_class: 'duration', unit_of_measurement: 'min' }],
      ['sensor.waschmaschine_programm', 'Baumwolle Long', { friendly_name: 'Waschmaschine Programm', ...ENUM(['Baumwolle Long', 'Feinwäsche', 'off']) }],
      ['sensor.waschmaschine_leistung', '0.4', { friendly_name: 'Waschmaschine Leistung', device_class: 'power', unit_of_measurement: 'W' }],
    ],
  },
  // Only a smart plug: the dashboard gets it from `appliances:` in the harness config
  {
    id: 'dev-trockner', name: 'Trockner', area: 'waschkeller', platform: 'mqtt', entities: [
      ['switch.trockner', 'on', { friendly_name: 'Trockner', device_class: 'outlet' }],
      ['sensor.trockner_leistung', '820', { friendly_name: 'Trockner Leistung', device_class: 'power', unit_of_measurement: 'W' }],
    ],
  },
  {
    id: 'dev-tv', name: 'TV-Wohnzimmer', model: 'Philips UHD Android TV', area: 'wohnzimmer', platform: 'androidtv_remote', entities: [
      ['media_player.tv_wohnzimmer', 'on', { friendly_name: 'TV-Wohnzimmer', device_class: 'tv', app_id: 'com.google.android.youtube.tv', app_name: 'YouTube', volume_level: 0.3, is_volume_muted: false, supported_features: 153529 }],
      ['remote.tv_wohnzimmer', 'on', { friendly_name: 'TV-Wohnzimmer Remote' }],
    ],
  },
  // The same TV over ADB, which the dashboard leaves out
  {
    id: 'dev-tv-adb', name: 'TV-Wohnzimmer (ADB)', area: 'wohnzimmer', platform: 'androidtv', entities: [
      ['media_player.tv_wohnzimmer_adb', 'off', { friendly_name: 'TV-Wohnzimmer (ADB)', device_class: 'tv', supported_features: 23997 }],
      ['remote.tv_wohnzimmer_adb', 'unknown', { friendly_name: 'TV-Wohnzimmer (ADB)' }],
    ],
  },
]

const extras: HassEntity[] = [
  { entity_id: 'sensor.flur_batterie', state: '9', attributes: { friendly_name: 'Flur Bewegungsmelder Batterie', device_class: 'battery', unit_of_measurement: '%' } },
  { entity_id: 'script.gute_nacht', state: 'off', attributes: { friendly_name: 'Gute Nacht', icon: 'mdi:weather-night', last_triggered: new Date(Date.now() - 15 * 3600_000).toISOString() } },
  { entity_id: 'sensor.kuche_fenster_batterie', state: '34', attributes: { friendly_name: 'Küche Fenster Batterie', device_class: 'battery', unit_of_measurement: '%' } },
  { entity_id: 'update.zigbee_router', state: 'on', attributes: { friendly_name: 'Zigbee Router Firmware', installed_version: '1.2.0', latest_version: '1.3.1' } },
  { entity_id: 'sensor.netz_leistung', state: '1.42', attributes: { friendly_name: 'Netz Leistung', device_class: 'power', unit_of_measurement: 'kW' } },
  { entity_id: 'sensor.pv_leistung', state: '860', attributes: { friendly_name: 'PV Leistung', device_class: 'power', unit_of_measurement: 'W' } },
  { entity_id: 'person.frank', state: 'home', attributes: { friendly_name: 'Frank Carlo' } },
  { entity_id: 'person.leni', state: 'not_home', attributes: { friendly_name: 'Leni' } },
  { entity_id: 'alarm_control_panel.haus', state: 'armed_home', attributes: { friendly_name: 'Alarmanlage' } },
  {
    entity_id: 'weather.home', state: 'partlycloudy', attributes: {
      friendly_name: 'Zuhause', temperature: 11.2, temperature_unit: '°C', apparent_temperature: 8.6, humidity: 74, pressure: 1018, pressure_unit: 'hPa',
      wind_speed: 14.4, wind_speed_unit: 'km/h', wind_bearing: 230, visibility: 10, visibility_unit: 'km', supported_features: 3,
    },
  },
  // A weather station at the house, ?sensors uses it in the weather card
  { entity_id: 'sensor.aussen_temperatur', state: '9.4', attributes: { friendly_name: 'Außen Temperatur', device_class: 'temperature', unit_of_measurement: '°C' } },
  { entity_id: 'sensor.aussen_luftfeuchte', state: '81', attributes: { friendly_name: 'Außen Luftfeuchte', device_class: 'humidity', unit_of_measurement: '%' } },
  { entity_id: 'sensor.aussen_helligkeit', state: '2920', attributes: { friendly_name: 'Außen Helligkeit', device_class: 'illuminance', unit_of_measurement: 'lx' } },
  { entity_id: 'sensor.aussen_regen', state: '0.4', attributes: { friendly_name: 'Außen Regen', device_class: 'precipitation_intensity', unit_of_measurement: 'mm/h' } },
  { entity_id: 'calendar.familie', state: 'off', attributes: { friendly_name: 'Familie', supported_features: 7 } },
  { entity_id: 'calendar.abfall', state: 'off', attributes: { friendly_name: 'Abfall', supported_features: 3 } },
  { entity_id: 'calendar.feiertage', state: 'off', attributes: { friendly_name: 'Feiertage' } },
  // NINA keeps one binary sensor per warning slot; ?warn=on fills the first
  { entity_id: 'binary_sensor.warning_mulheim_1', state: 'off', attributes: { friendly_name: 'Warnung Mülheim 1' } },
  { entity_id: 'binary_sensor.warning_mulheim_2', state: 'off', attributes: { friendly_name: 'Warnung Mülheim 2' } },
]

export function createHass(dark: boolean): HomeAssistant {
  const states: Record<string, HassEntity> = {}
  const entities: HomeAssistant['entities'] = {}
  for (const [entity_id, state, attributes, area] of defs) {
    const minutesAgo = entity_id === 'media_player.kuche_radio' ? 2 : 10
    states[entity_id] = { entity_id, state, attributes, last_changed: new Date(Date.now() - minutesAgo * 60_000).toISOString() }
    entities[entity_id] = { entity_id, area_id: area, labels: [] }
  }
  // ?labels=technik hides these
  entities['switch.kuche_kaffee']!.labels = ['technik']
  entities['sensor.buro_keller_leistung']!.labels = ['technik']
  const devices: HomeAssistant['devices'] = {}
  for (const d of deviceDefs) {
    devices[d.id] = { id: d.id, name: d.name, model: d.model ?? null, area_id: d.area }
    for (const [entity_id, state, attributes, platform] of d.entities) {
      states[entity_id] = { entity_id, state, attributes, last_changed: new Date(Date.now() - 20 * 60_000).toISOString() }
      entities[entity_id] = { entity_id, device_id: d.id, platform: platform ?? d.platform, labels: [] }
    }
  }
  for (const e of extras) {
    states[e.entity_id] = e
    entities[e.entity_id] = { entity_id: e.entity_id, entity_category: e.entity_id.startsWith('sensor.') ? 'diagnostic' : null }
  }

  const hass: HomeAssistant = {
    states,
    entities,
    devices,
    areas: {
      wohnzimmer: { area_id: 'wohnzimmer', name: 'Wohnzimmer', icon: 'mdi:sofa', floor_id: 'eg', temperature_entity_id: 'sensor.wohnzimmer_temperatur', humidity_entity_id: 'sensor.wohnzimmer_luftfeuchte' },
      // Stand-in for an uploaded area picture
      kuche: { area_id: 'kuche', name: 'Küche', icon: 'mdi:countertop', floor_id: 'eg', picture: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#b45309"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs><rect width="800" height="300" fill="url(#g)"/><circle cx="620" cy="90" r="60" fill="#fde68a" opacity=".6"/></svg>')}` },
      esszimmer: { area_id: 'esszimmer', name: 'Esszimmer', icon: 'mdi:table-chair', floor_id: 'eg' },
      eingangstur: { area_id: 'eingangstur', name: 'Eingangstür', icon: 'mdi:door', floor_id: 'eg' },
      schlafzimmer: { area_id: 'schlafzimmer', name: 'Schlafzimmer', icon: 'mdi:bed', floor_id: 'og' },
      bad: { area_id: 'bad', name: 'Bad', icon: 'mdi:bathtub', floor_id: 'og' },
      buro_keller: { area_id: 'buro_keller', name: 'Büro Keller', icon: 'mdi:chair-rolling', floor_id: 'keller' },
      flur: { area_id: 'flur', name: 'Flur', icon: null },
      garage: { area_id: 'garage', name: 'Garage', icon: 'mdi:garage' },
      garten: { area_id: 'garten', name: 'Garten', icon: 'mdi:flower' },
      waschkeller: { area_id: 'waschkeller', name: 'Waschkeller', icon: 'mdi:washing-machine', floor_id: 'keller' },
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
        playing: 'Spielt', paused: 'Pausiert', heat: 'Heizen', armed_home: 'Scharf (zu Hause)', disarmed: 'Unscharf', triggered: 'Ausgelöst', partlycloudy: 'Teilweise bewölkt', unavailable: 'Nicht verfügbar',
      }
      const unit = e.attributes.unit_of_measurement
      return map[e.state] ?? (unit ? `${e.state} ${unit}` : e.state)
    },
    callService: async () => undefined,
    // Daily forecast like met.no: a mild day today, rain on day three
    connection: {
      subscribeMessage: async <T,>(callback: (msg: T) => void, msg: Record<string, unknown>) => {
        if (msg.type !== 'weather/subscribe_forecast') throw new Error(`mock: ${msg.type}`)
        const day = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString() }
        const forecast = [
          { datetime: day(0), condition: 'partlycloudy', temperature: 13, templow: 6, precipitation_probability: 10 },
          { datetime: day(1), condition: 'sunny', temperature: 15, templow: 4 },
          { datetime: day(2), condition: 'rainy', temperature: 9, templow: 5, precipitation_probability: 80 },
          { datetime: day(3), condition: 'cloudy', temperature: 8, templow: 1 },
          { datetime: day(4), condition: 'snowy-rainy', temperature: 3, templow: -2, precipitation_probability: 60 },
        ]
        setTimeout(() => callback({ type: 'daily', forecast } as T), 0)
        return () => undefined
      },
    },
    // Events around today, like HA's calendar API returns them
    callApi: async <T,>(_method: string, path: string) => {
      const [, id, query] = /^calendars\/([^?]+)\?(.*)$/.exec(path) ?? []
      const params = new URLSearchParams(query)
      const from = new Date(params.get('start') ?? 0)
      const to = new Date(params.get('end') ?? 0)
      return (calendarStore()[id ?? ''] ?? [])
        .filter(e => new Date(e.start.dateTime ?? `${e.start.date}T00:00`) < to && new Date(e.end.dateTime ?? `${e.end.date}T00:00`) > from) as T
    },
    callWS: async <T,>(msg: Record<string, unknown>) => {
      if (String(msg.type).startsWith('calendar/event/')) return calendarCommand(msg) as T
      if (msg.type === 'energy/get_prefs') return {
        energy_sources: [
          { type: 'grid', stat_rate: 'sensor.netz_leistung' },
          { type: 'solar', stat_rate: 'sensor.pv_leistung' },
        ],
      } as T
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
export function applyService(hass: HomeAssistant, called: string, service: string, data: Record<string, any> = {}, target: Record<string, any> = {}): HomeAssistant {
  const ids: string[] = [].concat(target.entity_id ?? [])
  const states = { ...hass.states }
  for (const id of ids) {
    const e = states[id]
    if (!e) continue
    // homeassistant.turn_on/off acts on each entity's own domain
    const domain = called === 'homeassistant' ? id.split('.')[0]! : called
    let { state } = e
    const attributes = { ...e.attributes }
    if (service === 'toggle') state = state === 'on' ? 'off' : 'on'
    if (service === 'turn_on') state = domain === 'scene' ? new Date().toISOString() : 'on'
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

interface MockEvent { summary: string; start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string }; uid: string; recurrence_id?: string; rrule?: string; location?: string; description?: string }
let calendars: Record<string, MockEvent[]> | undefined

/** The harness calendars, kept while the page lives so adding, changing and deleting show up */
function calendarStore() {
  if (calendars) return calendars
  const day = (offset: number, h = 0, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); d.setDate(d.getDate() + offset); return d }
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let n = 0
  const timed = (summary: string, offset: number, h: number, m: number, minutes: number, extra = {}): MockEvent =>
    ({ summary, uid: `mock-${++n}`, start: { dateTime: day(offset, h, m).toISOString() }, end: { dateTime: new Date(day(offset, h, m).getTime() + minutes * 60_000).toISOString() }, ...extra })
  const allDay = (summary: string, offset: number, days = 1): MockEvent => ({ summary, uid: `mock-${++n}`, start: { date: local(day(offset)) }, end: { date: local(day(offset + days)) } })
  // A weekly series: each week's event is one occurrence with its own recurrence_id
  const weekly = Array.from({ length: 8 }, (_, w) => timed('Fußball Training', w * 7 - 7, 17, 30, 90, { uid: 'mock-training', rrule: 'FREQ=WEEKLY', recurrence_id: local(day(w * 7 - 7)).replaceAll('-', '') }))
  calendars = {
    'calendar.familie': [
      timed('Zahnarzt Leni', 0, 9, 30, 60, { location: 'Praxis Dr. Berg, Schloßstraße 4' }),
      timed('Elternabend', 0, 19, 0, 90),
      timed('Einkaufen', 1, 10, 0, 60),
      timed('Geburtstag Oma', 2, 15, 0, 180, { description: 'Kuchen mitbringen' }),
      timed('Frühstück mit Tom', 2, 9, 0, 90),
      timed('Physiotherapie', 3, 8, 0, 45),
      timed('Kino', 5, 20, 15, 150),
      allDay('Urlaub Sylt', 12, 5),
      timed('Kita Fest', -3, 14, 0, 120),
      ...weekly,
    ],
    'calendar.abfall': [allDay('Restmüll', 1), allDay('Papier', 8), allDay('Gelbe Tonne', 4), allDay('Bio', 11), allDay('Restmüll', 15)],
    'calendar.feiertage': [allDay('Martinstag', 5)],
  }
  return calendars
}

/** HA's calendar/event/create, update and delete, on the harness calendars */
function calendarCommand(msg: Record<string, unknown>) {
  const list = calendarStore()[msg.entity_id as string] ?? []
  const when = (v: string) => (v.includes('T') ? { dateTime: new Date(v).toISOString() } : { date: v })
  const fields = (e: Record<string, string>) => ({ summary: e.summary!, start: when(e.dtstart!), end: when(e.dtend!), ...(e.location ? { location: e.location } : {}), ...(e.description ? { description: e.description } : {}) })
  const hits = (e: MockEvent) => e.uid === msg.uid && (!msg.recurrence_id || (msg.recurrence_range ? e.recurrence_id! >= (msg.recurrence_id as string) : e.recurrence_id === msg.recurrence_id))
  if (msg.type === 'calendar/event/create') list.push({ uid: `mock-${Date.now()}`, ...fields(msg.event as Record<string, string>) })
  if (msg.type === 'calendar/event/delete') for (let i = list.length - 1; i >= 0; i--) if (hits(list[i]!)) list.splice(i, 1)
  if (msg.type === 'calendar/event/update') {
    const target = list.find(hits)
    if (!target) throw new Error('Termin nicht gefunden')
    Object.assign(target, { location: undefined, description: undefined }, fields(msg.event as Record<string, string>))
  }
  return null
}
