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
  ['todo.einkauf', '3', { friendly_name: 'Einkaufsliste' }, 'kuche'],
  ['todo.werkstatt', '0', { friendly_name: 'Werkstatt' }, 'garage'],
  ['sensor.garten_temperatur', '9.4', { friendly_name: 'Garten Temperatur', device_class: 'temperature', unit_of_measurement: '°C' }, 'garten'],
  ['sensor.garten_luftfeuchte', '82', { friendly_name: 'Garten Luftfeuchte', device_class: 'humidity', unit_of_measurement: '%' }, 'garten'],
  ['switch.buro_keller_drucker', 'unavailable', { friendly_name: 'Drucker' }, 'buro_keller'],

  ['light.garage', 'off', { friendly_name: 'Garage', supported_color_modes: ['onoff'] }, 'garage'],
  ['light.haustur', 'off', { friendly_name: 'Haustürlicht', supported_color_modes: ['onoff'] }, 'eingangstur'],
  ['binary_sensor.garage_tor', 'on', { friendly_name: 'Garagentor', device_class: 'garage_door' }, 'garage'],
  ['cover.garage_tor', 'open', { friendly_name: 'Garagentorantrieb', device_class: 'garage' }, 'garage'],
  ['binary_sensor.garage_rauch', 'off', { friendly_name: 'Garage Rauchmelder', device_class: 'smoke' }, 'garage'],
]

type DeviceDef = { id: string; name: string; model?: string; area: string; platform?: string; entities: [entityId: string, state: string, attributes: Record<string, unknown>, platform?: string][] }

const PROGRAMS = ['dishcare_dishwasher_program_eco_50', 'dishcare_dishwasher_program_auto_2', 'dishcare_dishwasher_program_quick_45']
const ENUM = (options: string[]) => ({ device_class: 'enum', options })

// A still for each camera, drawn: sky or wall, ground, and a shape for what stands there
const still = (top: string, bottom: string, shape: string) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/>${shape}</svg>`)}`
const MOTION = { device_class: 'motion' }

// Appliances and a TV as their integrations bring them: one device with many entities each

// Music Assistant: a few speakers, one Spotify account, a small library. Covers are drawn, so the harness needs no network.
const cover = (hue: number, text = '') => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 55%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 60% 25%)"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="220" cy="80" r="70" fill="#fff" opacity=".12"/><text x="24" y="270" font-family="sans-serif" font-size="34" font-weight="700" fill="#fff" opacity=".85">${text}</text></svg>`)}`
type Mi = { uri: string; name: string; media_type: string; image?: string; artists?: { name: string }[]; album?: { name: string }; favorite?: boolean }
const mi = (media_type: string, id: number, name: string, hue: number, artist?: string): Mi => ({
  uri: `library://${media_type}/${id}`, name, media_type, image: cover(hue, name.split(' ')[0]!.slice(0, 10)),
  ...(artist ? { artists: [{ name: artist }] } : {}),
})
const library: Record<string, Mi[]> = {
  playlist: [
    mi('playlist', 1, 'Sonntagmorgen', 30), mi('playlist', 2, 'Kochen mit Musik', 340), mi('playlist', 3, 'Italo Classics', 200),
    mi('playlist', 4, 'Fokus', 260), mi('playlist', 5, 'Party im Garten', 120), mi('playlist', 6, 'Einschlafen', 230), mi('playlist', 7, 'Roadtrip 2026', 10),
  ],
  album: [
    mi('album', 11, 'Mezzanine', 280, 'Massive Attack'), mi('album', 12, 'Che Fantastica Storia', 40, 'Antonello Venditti'), mi('album', 13, 'Random Access Memories', 50, 'Daft Punk'),
    mi('album', 14, 'Blue', 210, 'Joni Mitchell'), mi('album', 15, 'In Rainbows', 15, 'Radiohead'),
  ],
  artist: [mi('artist', 21, 'Massive Attack', 280), mi('artist', 22, 'Lucio Dalla', 30), mi('artist', 23, 'Daft Punk', 50), mi('artist', 24, 'Radiohead', 15), mi('artist', 25, 'Nina Simone', 320)],
  track: [
    mi('track', 31, 'Teardrop', 280, 'Massive Attack'), mi('track', 32, 'Caruso', 30, 'Lucio Dalla'), mi('track', 33, 'Get Lucky', 50, 'Daft Punk'),
    mi('track', 34, 'Feeling Good', 320, 'Nina Simone'), mi('track', 35, 'Nude', 15, 'Radiohead'),
  ],
  radio: [mi('radio', 41, 'Radio Bremen Eins', 190), mi('radio', 42, 'Deutschlandfunk', 0), mi('radio', 43, 'FluxFM', 300), mi('radio', 44, 'LolliRadio Italia', 100), mi('radio', 45, 'WDR 2', 220)],
}
const tracksOf = (item: Mi) => library.track.concat(library.track.map((t, i) => ({ ...t, uri: `${t.uri}-${item.uri}-${i}`, name: `${t.name} (Live)` })))

// Two Spotify accounts, as a Sonos speaker's media browser lists them; the first belongs to spotify_frank
const SPOTIFY_ACCOUNTS = [{ id: 'spotify://entry-media_player.spotify_frank', title: 'frank.c' }, { id: 'spotify://01LENI', title: 'lenimusik' }]
function spotifyBrowse(id: string) {
  const sp = (account: string, kind: string, n: number, name: string, hue: number, cls: string) => ({
    title: name, media_class: cls, media_content_type: `spotify://${cls}`, media_content_id: `${account.toLowerCase()}/spotify:${kind}:${n}`,
    thumbnail: cover(hue, name.split(' ')[0]!.slice(0, 10)), can_play: true, can_expand: cls !== 'track',
  })
  const account = SPOTIFY_ACCOUNTS.find(a => id.toLowerCase().startsWith(a.id.toLowerCase()))
  if (!account) return undefined
  const leni = account.title === 'lenimusik'
  const names = leni ? ['Pferde-Hörspiele', 'Tanzen!', 'Hausaufgaben', 'Lieblingslieder'] : ['Discover Weekly', 'Italo Disco', 'Jazz am Abend', 'Workout', 'Daniel Caesar Mix', 'Release Radar', 'Kochen', 'Sommer 2026']
  const tracks = (k: string) => ['Little Rowboat', 'Get You', 'Best Part', 'Vasco', 'Sere nere', 'Azzurro', 'Volare', 'Caruso', 'Ciao'].map((t, i) => sp(account.id, 'track', i + (k.length * 10), t, (i * 40 + k.length * 7) % 360, 'track'))
  const lists: Record<string, ReturnType<typeof sp>[]> = {
    current_user_playlists: names.map((n, i) => sp(account.id, 'playlist', i, n, (i * 47 + (leni ? 90 : 0)) % 360, 'playlist')),
    current_user_recently_played: tracks('recent'),
    current_user_followed_artists: ['Daniel Caesar', 'Vasco Rossi', 'Mina', 'Frank Ocean', 'Coez'].map((n, i) => sp(account.id, 'artist', i, n, i * 70, 'artist')),
    current_user_saved_albums: ['Never Enough', 'Blonde', 'Freudian'].map((n, i) => sp(account.id, 'album', i, n, i * 90 + 20, 'album')),
    current_user_saved_tracks: tracks('saved_tracks'),
    current_user_top_artists: leni ? [] : ['Daniel Caesar', 'A$AP Rocky'].map((n, i) => sp(account.id, 'artist', 10 + i, n, i * 120, 'artist')),
    current_user_top_tracks: [],
  }
  const key = id.split('/').pop()!
  if (id.toLowerCase() === account.id.toLowerCase()) return { title: account.title, children: Object.keys(lists).map(k => ({ title: k, media_class: 'directory', media_content_type: `spotify://${k}`, media_content_id: `${account.id}/${k}`, can_expand: true, can_play: false })) }
  if (lists[key]) return { title: key, children: lists[key] }
  return { title: 'Playlist', thumbnail: null, children: tracks(key) }
}

export const musicDefs: Def[] = [
  ['media_player.ma_kuche', 'playing', {
    friendly_name: 'Lautsprecher', mass_player_type: 'player', device_class: 'speaker', volume_level: 0.42, shuffle: false, repeat: 'off',
    media_title: 'Teardrop', media_artist: 'Massive Attack', media_album_name: 'Mezzanine', media_content_id: 'library://track/31', media_duration: 331, media_position: 74,
    media_position_updated_at: new Date().toISOString(), entity_picture_local: cover(280, 'Mezzanine'), group_members: ['media_player.ma_kuche'], supported_features: 8320575,
  }, 'kuche'],
  ['media_player.ma_wohnzimmer', 'idle', { friendly_name: 'Lautsprecher', mass_player_type: 'player', device_class: 'speaker', volume_level: 0.3, group_members: [], supported_features: 8320575 }, 'wohnzimmer'],
  ['media_player.ma_schlafzimmer', 'paused', {
    friendly_name: 'Nest Mini', mass_player_type: 'player', device_class: 'speaker', volume_level: 0.18, group_members: [], supported_features: 8320575,
    media_title: 'Deutschlandfunk', media_content_id: 'library://radio/42', entity_picture_local: cover(0, 'DLF'),
  }, 'schlafzimmer'],
  ['media_player.ma_buro', 'unavailable', { friendly_name: 'Büro Sonos', mass_player_type: 'player', supported_features: 8320575 }, 'buro_keller'],
  // Music Assistant's dashboard entity for a Cast display: same platform, but no player
  ['media_player.ma_nest_hub_dashboard', 'idle', { friendly_name: 'Nest Hub', device_class: 'tv', supported_features: 131840 }, 'kuche'],
  ['media_player.spotify_frank', 'idle', { friendly_name: 'Spotify Frank', supported_features: 2048 }, ''],
  // Sonos lists every Spotify account in its media browser
  ['media_player.wohnzimmer_sonos_raw', 'idle', { friendly_name: 'Wohnzimmer Sonos (direkt)', supported_features: 8321599 }, 'wohnzimmer'],
]

const deviceDefs: DeviceDef[] = [
  // A Reolink doorbell: three streams, of which the page shows one, and its detections
  {
    id: 'dev-cam-haustur', name: 'Haustür', model: 'Reolink Video Doorbell', area: 'eingangstur', platform: 'reolink', entities: [
      ['camera.haustur_standardauflosung', 'idle', { friendly_name: 'Haustür Standardauflösung', entity_picture: still('#cbd5e1', '#64748b', '<rect x="380" y="60" width="160" height="300" fill="#e2e8f0"/><rect x="120" y="150" width="140" height="190" rx="8" fill="#1e293b"/>') }],
      ['camera.haustur_hochauflosung', 'idle', { friendly_name: 'Haustür Hochauflösung' }],
      ['camera.haustur_schnappschusse', 'idle', { friendly_name: 'Haustür Schnappschüsse' }],
      ['binary_sensor.haustur_person', 'off', { friendly_name: 'Haustür Person', ...MOTION }],
      ['binary_sensor.haustur_paket', 'off', { friendly_name: 'Haustür Paket', ...MOTION }],
      ['binary_sensor.haustur_besucher', 'off', { friendly_name: 'Haustür Besucher' }],
      ['binary_sensor.haustur_bewegung', 'off', { friendly_name: 'Haustür Bewegung', ...MOTION }],
      ['binary_sensor.haustur_schlafstatus', 'off', { friendly_name: 'Haustür Schlafstatus' }],
    ],
  },
  {
    id: 'dev-cam-terrasse', name: 'Terrasse', model: 'Argus 4', area: 'garten', platform: 'reolink', entities: [
      ['camera.terrasse', 'idle', { friendly_name: 'Terrasse', entity_picture: still('#334155', '#14532d', '<path d="M0 260 Q160 200 320 250 T640 230 V400 H0Z" fill="#166534"/><ellipse cx="300" cy="300" rx="40" ry="22" fill="#a16207"/>') }],
      ['binary_sensor.terrasse_tier', 'off', { friendly_name: 'Terrasse Tier', ...MOTION }],
      ['binary_sensor.terrasse_person', 'off', { friendly_name: 'Terrasse Person', ...MOTION }],
      ['light.terrasse_flutlicht', 'off', { friendly_name: 'Terrasse Flutlicht', supported_color_modes: ['onoff'] }],
    ],
  },
  {
    id: 'dev-cam-einfahrt', name: 'Einfahrt', model: 'RLC-810A', area: 'garage', platform: 'reolink', entities: [
      ['camera.einfahrt', 'idle', { friendly_name: 'Einfahrt', entity_picture: still('#e2e8f0', '#94a3b8', '<rect y="250" width="640" height="150" fill="#cbd5e1"/><rect x="60" y="120" width="120" height="160" fill="#78716c"/><circle cx="420" cy="320" r="18" fill="#57534e"/>') }],
      ['binary_sensor.einfahrt_person', 'off', { friendly_name: 'Einfahrt Person', ...MOTION }],
      ['binary_sensor.einfahrt_fahrzeug', 'off', { friendly_name: 'Einfahrt Fahrzeug', ...MOTION }],
    ],
  },
  {
    id: 'dev-cam-esszimmer', name: 'Esszimmer', model: 'E1 Zoom', area: 'esszimmer', platform: 'reolink', entities: [
      ['camera.esszimmer', 'idle', { friendly_name: 'Esszimmer', entity_picture: still('#f8fafc', '#d6d3d1', '<rect x="140" y="230" width="360" height="24" fill="#92400e"/><rect x="440" y="80" width="140" height="120" fill="#bae6fd"/>') }],
    ],
  },
  {
    id: 'dev-cam-flur', name: 'Flur', model: 'E1 Pro', area: 'flur', platform: 'reolink', entities: [
      ['camera.flur', 'idle', { friendly_name: 'Flur', entity_picture: still('#e7e5e4', '#a8a29e', '<rect x="250" y="70" width="140" height="300" fill="#f5f5f4"/><rect x="40" y="0" width="60" height="400" fill="#d6d3d1"/>') }],
      ['binary_sensor.flur_person', 'off', { friendly_name: 'Flur Person', ...MOTION }],
    ],
  },
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

/** Today's detections as the recorder keeps them: off, then on and off again for each one, minutes ago */
function cameraHistory(since: number, ids: string[]) {
  const seen: [entity: string, minutesAgo: number][] = [
    ['binary_sensor.flur_person', 72], ['binary_sensor.einfahrt_person', 140], ['binary_sensor.einfahrt_fahrzeug', 141],
    ['binary_sensor.terrasse_tier', 210], ['binary_sensor.haustur_bewegung', 330], ['binary_sensor.haustur_paket', 329],
    ['binary_sensor.haustur_besucher', 331], ['binary_sensor.haustur_person', 420], ['binary_sensor.terrasse_person', 500],
    ['binary_sensor.haustur_bewegung', 6],
  ]
  const now = Date.now()
  const out: Record<string, { s: string; lu: number }[]> = {}
  for (const id of ids) {
    const rows = [{ s: 'off', lu: since / 1000 }]
    for (const [, ago] of seen.filter(([e]) => e === id).sort((a, b) => b[1] - a[1])) {
      const at = now - ago * 60_000
      if (at < since) continue
      rows.push({ s: 'on', lu: at / 1000 }, { s: 'off', lu: at / 1000 + 40 })
    }
    out[id] = rows
  }
  return out
}

export function createHass(dark: boolean): HomeAssistant {
  const states: Record<string, HassEntity> = {}
  const entities: HomeAssistant['entities'] = {}
  for (const [entity_id, state, attributes, area] of defs) {
    const minutesAgo = entity_id === 'media_player.kuche_radio' ? 2 : 10
    states[entity_id] = { entity_id, state, attributes, last_changed: new Date(Date.now() - minutesAgo * 60_000).toISOString() }
    entities[entity_id] = { entity_id, area_id: area, labels: [] }
  }
  for (const [entity_id, state, attributes, area] of musicDefs) {
    states[entity_id] = { entity_id, state, attributes, last_changed: new Date(Date.now() - 4 * 60_000).toISOString() }
    entities[entity_id] = { entity_id, area_id: area || null, labels: [], platform: entity_id.includes('spotify') ? 'spotify' : entity_id.endsWith('_raw') ? 'sonos' : 'music_assistant' }
  }
  // The shopping list integration has one list; Local To-do lists can be deleted on their own
  entities['todo.einkauf']!.platform = 'shopping_list'
  entities['todo.werkstatt']!.platform = 'local_todo'
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
      if (msg.type === 'call_service' && msg.domain === 'music_assistant') return { context: {}, response: musicResponse(msg, latest ?? states) } as T
      if (msg.type === 'media_player/browse_media' && msg.entity_id === 'media_player.wohnzimmer_sonos_raw') {
        await new Promise(r => setTimeout(r, 300))
        if (!msg.media_content_id) return { title: 'Sonos', children: SPOTIFY_ACCOUNTS.map(a => ({ title: a.title, media_class: 'app', media_content_type: 'spotify://library', media_content_id: a.id, can_expand: true, can_play: false })) } as T
        const node = spotifyBrowse(String(msg.media_content_id))
        if (!node) throw new Error('not found')
        return node as T
      }
      if (msg.type === 'media_player/browse_media') {
        const item = Object.values(library).flat().find(i => i.uri === msg.media_content_id)
        await new Promise(r => setTimeout(r, 300))
        if (!item) throw new Error('not found')
        const children = item.media_type === 'artist' ? library.album.slice(0, 3) : tracksOf(item)
        return { title: item.name, thumbnail: item.image, children: children.map(c => ({
          title: c.media_type === 'track' ? `${c.artists?.[0]?.name} - ${c.name}` : c.name, media_class: c.media_type, media_content_id: c.uri,
          media_content_type: 'music', thumbnail: c.image, can_play: true, can_expand: c.media_type !== 'track',
        })) } as T
      }
      if (msg.type === 'history/history_during_period') return cameraHistory(Date.parse(String(msg.start_time)), msg.entity_ids as string[]) as T
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

/** The newest fake states, for the queue */
let latest: Record<string, HassEntity> | undefined

/** Music Assistant's services that answer: library, search, queue */
async function musicResponse(msg: Record<string, any>, states: Record<string, HassEntity>) {
  await new Promise(r => setTimeout(r, 250))
  const data = msg.service_data ?? {}
  if (msg.service === 'get_library') {
    let items = [...(library[data.media_type] ?? [])]
    if (data.order_by === 'last_played_desc') items = items.slice().reverse()
    if (data.favorite) items = items.slice(0, 5)
    return { items: items.slice(0, data.limit ?? 25), limit: data.limit, offset: 0, media_type: data.media_type }
  }
  if (msg.service === 'search') {
    const q = String(data.name).toLowerCase()
    const hit = (list: Mi[]) => list.filter(i => i.name.toLowerCase().includes(q) || i.artists?.some(a => a.name.toLowerCase().includes(q)))
    return { tracks: hit(library.track), artists: hit(library.artist), albums: hit(library.album), playlists: hit(library.playlist), radio: hit(library.radio) }
  }
  if (msg.service === 'get_queue') {
    const id = [msg.target?.entity_id].flat()[0] as string
    const e = states[id]
    const current = library.track.find(t => t.uri === e?.attributes.media_content_id) ?? library.track[0]!
    const next = library.track[(library.track.indexOf(current) + 1) % library.track.length]!
    return { [id]: { items: 24, current_item: { name: current.name, media_item: current }, next_item: { name: next.name, media_item: next } } }
  }
  return {}
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
    if (domain === 'media_player' && service === 'media_play') state = 'playing'
    if (domain === 'media_player' && service === 'media_pause') state = 'paused'
    if (domain === 'media_player' && service === 'volume_set') attributes.volume_level = data.volume_level
    if (domain === 'media_player' && service === 'volume_mute') attributes.is_volume_muted = data.is_volume_muted
    if (domain === 'media_player' && service === 'shuffle_set') attributes.shuffle = data.shuffle
    if (domain === 'media_player' && service === 'repeat_set') attributes.repeat = data.repeat
    if (domain === 'media_player' && service === 'media_seek') Object.assign(attributes, { media_position: data.seek_position, media_position_updated_at: new Date().toISOString() })
    if (domain === 'media_player' && service === 'join') attributes.group_members = [id, ...((attributes.group_members ?? []) as string[]).filter((m: string) => m !== id), ...data.group_members]
    if (domain === 'media_player' && service === 'unjoin') {
      for (const [other, o] of Object.entries(states)) {
        if (other !== id && (o.attributes.group_members as string[] | undefined)?.includes(id)) {
          states[other] = { ...o, attributes: { ...o.attributes, group_members: (o.attributes.group_members as string[]).filter(m => m !== id) } }
        }
      }
    }
    if (domain === 'media_player' && ['media_next_track', 'media_previous_track'].includes(service)) {
      const list = library.track
      const at = list.findIndex(t => t.uri === attributes.media_content_id)
      const next = list[(at + (service === 'media_next_track' ? 1 : list.length - 1)) % list.length]!
      Object.assign(attributes, { media_title: next.name, media_artist: next.artists?.[0]?.name, media_content_id: next.uri, entity_picture_local: next.image, media_position: 0, media_position_updated_at: new Date().toISOString(), media_duration: 240 })
    }
    if (called === 'music_assistant' && service === 'play_media') {
      const all = Object.values(library).flat()
      const item = all.find(i => i.uri === data.media_id)
      const start = all.find(i => i.uri === data.start_item) ?? (item?.media_type === 'track' || item?.media_type === 'radio' ? item : library.track[0])
      if (['play', 'replace', undefined].includes(data.enqueue) && start) {
        state = 'playing'
        Object.assign(attributes, {
          media_title: start.name, media_artist: start.artists?.[0]?.name, media_content_id: start.uri, entity_picture_local: start.image,
          media_position: 0, media_position_updated_at: new Date().toISOString(), media_duration: start.media_type === 'radio' ? 0 : 240,
        })
      }
    }
    if (called === 'music_assistant' && service === 'transfer_queue') {
      const from = states[data.source_player]
      if (from) {
        for (const key of ['media_title', 'media_artist', 'media_content_id', 'entity_picture_local', 'media_duration', 'media_position', 'media_position_updated_at']) attributes[key] = from.attributes[key]
        state = 'playing'
        states[data.source_player] = { ...from, state: 'idle' }
      }
    }
    states[id] = { ...e, state, attributes }
  }
  latest = states
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
