import { accessOf, intersect, ruleFor } from './access'
import { normalizeConfig } from './config'
import { faceFor, loadPersonal, personalAllowed, withPersonal } from './personal'
import { t, type Key } from './i18n'
import {
  SECURITY_GROUPS, allEntities, areaEntities, arrangeRoom, averageClimate, hideOf, bulkControl, coverKind, entityAreaId, favoriteEntities, isRoomFavorite,
  floorsWithAreas, groupEntities, groupOf, isPower, powerSources, sceneEntities, socketReadings, type EnergyPrefs,
} from './model'
import { domainOf, entityName, shortName } from './presentation'
import { weatherEntity, weatherSensors } from './weather'
import { applianceEntities, findAppliances, findTvs } from './appliances'
import { findCameras } from './cameras'
import { findSchools, schoolIds, type School } from './school'
import { co2Sensors, findEventSources } from './events'
import { resolvePopups } from './popups'
import { findMusicPlayers, findSpotifyBrowsers } from './music'
import { tvApps } from './tv-apps'
import { glassBackground, imageBackground, isHexColor, pageBackground } from './styles/palette'
import type { NavItem } from './cards/nav-bar'
import type { FaceSettings } from './cards/face'
import type { AreaRegistryEntry, CardSlot, HassEntity, HomeAssistant, OwnCardsPage, PagePath, StrategyConfig } from './types'

type Card = Record<string, unknown>
type Section = { type: 'grid'; column_span?: number; cards: Card[] }
type View = Record<string, unknown>

const MAX_COLUMNS = 4

const areaPath = (areaId: string) => `area-${areaId}`
const dashboardPath = () => (typeof location === 'undefined' ? undefined : location.pathname.split('/')[1]) || 'lovelace'

function heading(text: string, icon?: string | null, navigateTo?: string, style: 'title' | 'subtitle' = 'title'): Card {
  return {
    type: 'heading',
    heading: text,
    heading_style: style,
    ...(icon ? { icon } : {}),
    ...(navigateTo ? { tap_action: { action: 'navigate', navigation_path: `/${dashboardPath()}/${navigateTo}` } } : {}),
  }
}

const fullWidth = (cards: Card[]): Section => ({ type: 'grid', column_span: MAX_COLUMNS, cards })

/**
 * Own cards at the top or the bottom of a page, each in a section of its own, so they sit side by side where there is
 * room and stack on a phone. `column_span` on a card (1 to 4) sets how wide its section is; it is taken off the card.
 * The card fills its section unless it brings its own grid_options: stacks and many custom cards would take
 * only part of it otherwise.
 */
export function ownSections(cards: Card[] | undefined, span?: number): Section[] {
  return (cards ?? []).map(card => {
    const { column_span, ...rest } = card
    const width = Math.min(MAX_COLUMNS, Math.max(1, Math.round(Number(column_span) || span || 1)))
    const filled = rest.grid_options || rest.layout_options ? rest : { ...rest, grid_options: { columns: 'full' } }
    return { type: 'grid', ...(column_span !== undefined || span ? { column_span: width } : {}), cards: [filled] }
  })
}

/** Build the generated dashboard. Runs in the browser whenever the dashboard loads. */
export async function generateDashboard(rawConfig: StrategyConfig, hass: HomeAssistant) {
  const baseConfig = normalizeConfig(rawConfig)
  // The viewing user's rule narrows rooms and pages on top of the dashboard's own filter.
  // HA runs the strategy in each browser with that browser's user, so every user gets their own dashboard.
  const rule = ruleFor(baseConfig.users, hass.user)
  const access = accessOf(rule)
  // The user's own settings (look, face, pages, favorites) on top, unless the admin keeps this user to the rule
  const allowPersonal = personalAllowed(rule)
  const personal = allowPersonal ? await loadPersonal(hass, dashboardPath()) : undefined
  const config: StrategyConfig = withPersonal({
    ...baseConfig,
    areas: intersect(baseConfig.areas, rule?.areas),
    floors: intersect(baseConfig.floors, rule?.floors),
  }, personal)
  // Pages the user chose not to see: left out of the nav bar and the views, still offered on the settings page
  const ownHidden = new Set<string>(personal?.hide_pages ?? [])
  const look = {
    ...(config.theme ? { theme: config.theme } : {}),
    ...(config.glass ? { glass: true } : {}),
    ...(isHexColor(config.primary_color) ? { primary_color: config.primary_color } : {}),
    ...(access !== 'full' ? { access } : {}),
  }
  const hide = hideOf(config)
  // Cards filter on their own, so they get the same options
  const hideOpts = {
    ...(config.hide_domains?.length ? { hide_domains: config.hide_domains } : {}),
    ...(config.hide_labels?.length ? { hide_labels: config.hide_labels } : {}),
    ...(config.hide_entities?.length ? { hide_entities: config.hide_entities } : {}),
  }
  const floors = floorsWithAreas(hass, config)
  const areas = floors.flatMap(f => f.areas)
  // areas/floors narrow the whole dashboard, e.g. to one room for a wall tablet
  const scoped = !!(config.areas?.length || config.floors?.length)
  if (scoped && !areas.length) {
    const who = rule ? ` (Nutzer ${hass.user?.name})` : ''
    throw new Error(`Auto Dashboard: keine Räume mit Geräten für areas ${JSON.stringify(config.areas ?? [])} / floors ${JSON.stringify(config.floors ?? [])}${who}`)
  }
  const areaIds = scoped ? areas.map(a => a.area_id) : undefined
  const all = allEntities(hass, hide, areaIds)
  const position = config.nav_position ?? 'bottom'

  // A socket shows its power and energy on its tile; its single readings leave the room's sensors
  const sockets = socketReadings(hass)
  const tile = (entity: HassEntity, areaName?: string): Card => {
    const socket = sockets.get(entity.entity_id)
    return {
      type: 'custom:ad-tile', entity: entity.entity_id, ...(areaName ? { area_name: areaName } : {}),
      ...(socket?.power ? { power: socket.power } : {}), ...(socket?.energy ? { energy: socket.energy } : {}), ...look,
    }
  }
  // Heading with one control for the whole group (all lights of a room, all covers, ...)
  const groupHeading = (title: string, entities: HassEntity[], extra: Card = {}): Card => {
    const bulk = bulkControl(entities)
    return {
      type: 'custom:ad-group-heading', title, entities: bulk.entities.map(e => e.entity_id),
      ...(bulk.control ? { control: bulk.control } : {}), ...extra, ...look,
    }
  }
  const favorites = favoriteEntities(hass, config.favorites, areaIds)
  const scenes = sceneEntities(hass, config.scenes, hide, areaIds)
  const ofDomain = (domain: string) => (e: HassEntity) => domainOf(e.entity_id) === domain
  const cameras = all.filter(ofDomain('camera'))
  // HA's own cards for what it draws best: camera streams, editable to-do lists, statistics graphs
  // Under its room's heading a camera named like the room shows no caption, a "Garage Einfahrt" just "Einfahrt"
  // One camera per device: a doorbell's sub stream, main stream and snapshots are one camera
  const cameraInfos = findCameras(hass, cameras, hide)
  const cameraCard = (e: HassEntity, areaName?: string, own?: string): Card => {
    const name = own ?? entityName(e)
    const label = shortName(name, areaName)
    return {
      type: 'picture-entity', entity: e.entity_id, show_state: false, camera_view: 'auto', grid_options: { columns: 12 },
      ...(areaName && name.trim().toLowerCase() === areaName.trim().toLowerCase() ? { show_name: false } : label !== name ? { name: label } : {}),
    }
  }
  // Appliances and TVs get their own cards; what those cards show leaves the room page's groups
  const appliances = findAppliances(hass, config.appliances, hide, areaIds)
  const tvs = findTvs(hass, hide, areaIds)
  // Pupils with a WebUntis timetable: a card on Home and in their room, their many sensors in it instead of as tiles
  const schools = findSchools(hass, hide, areaIds)
  const claimed = new Set([
    ...schoolIds(schools),
    ...appliances.flatMap(a => applianceEntities(hass, a)),
    ...[...sockets.values()].flatMap(s => s.readings),
    ...tvs.flatMap(tv => [tv.entity, ...(tv.remote ? [tv.remote] : []), ...tv.others]),
  ])
  const applianceCard = (appliance: (typeof appliances)[number], home = false): Card =>
    ({ type: 'custom:ad-appliance', appliance, ...(home ? { only_active: true } : {}), ...look })
  const outdoor = config.outdoor_areas ?? []
  const indoor = areas.filter(a => !outdoor.includes(a.area_id))
  // Pages hidden on the dashboard go for everyone, a rule's on top of them for that user
  const pageAllowed = (path: PagePath) => !config.hide_pages?.includes(path) && !rule?.hide_pages?.includes(path)
  // Chips hidden for everyone, plus the user's own
  const hiddenChips = [...new Set([...(config.hide_chips ?? []), ...(rule?.hide_chips ?? []), ...(config.school_chips === false ? ['school' as const] : [])])]
  const chipOpts = hiddenChips.length ? { hide_chips: hiddenChips } : {}
  // What's coming up: bins, warnings, birthdays and parcels for the whole house; CO₂ and appliances in the shown rooms
  const co2 = co2Sensors(hass, all.map(e => e.entity_id))
  const events = findEventSources(hass, {
    hide, co2, appliances, warnings: config.weather_warnings, co2_limit: config.co2_limit, hidden: hiddenChips,
    skipCalendars: new Set(schools.map(s => s.timetable).filter((id): id is string => !!id)),
  })
  const roomEvents = (areaId: string) => {
    const ids = co2.filter(id => entityAreaId(hass, id) === areaId)
    return ids.length && !hiddenChips.includes('co2') ? { events: { co2: ids, ...(config.co2_limit ? { co2_limit: config.co2_limit } : {}) } } : {}
  }
  // The energy settings know the house meter; without them (or without access) the rooms' sum stands in
  const prefs = await hass.callWS?.<EnergyPrefs>({ type: 'energy/get_prefs' }).catch(() => undefined)
  const sources = powerSources(hass, prefs)
  const sourceOpts = sources ? { power_sources: sources } : {}
  const hasEnergy = pageAllowed('energy') && (all.some(isPower) || !!sources)
  const hasMaintenance = pageAllowed('maintenance')
  // The weather card takes over outside (and the weather next to the clock); inside stays a tile next to power
  const weather = weatherEntity(hass, config)
  const outsideTile = weather ? [] : outdoor
  const showClimate = averageClimate(hass, indoor, hide).temperature !== undefined || outsideTile.length > 0

  // Domain pages: which entities, and how the header counts and acts on them
  const domainPages = [
    {
      path: 'lights', icon: 'mdi:lightbulb-group', title: t(hass, 'lights'),
      // What happened today, beside the tiles
      activity: true,
      pick: (e: HassEntity) => domainOf(e.entity_id) === 'light',
      count_label: 'n_on', action: { label: 'all_off', icon: 'mdi:lightbulb-off-outline', service: 'turn_off' },
    },
    {
      path: 'climate', icon: 'mdi:thermostat', title: t(hass, 'climate'),
      pick: (e: HassEntity) => groupOf(e) === 'climate' ||
        (domainOf(e.entity_id) === 'sensor' && ['temperature', 'humidity'].includes(e.attributes.device_class)),
      counts: (e: HassEntity) => groupOf(e) === 'climate',
      // One card per room: the thermostat in the middle, all readings of the room beneath
      roomCard: (area: AreaRegistryEntry, entities: HassEntity[]): Card => ({
        type: 'custom:ad-climate-room', area: area.area_id, path: areaPath(area.area_id), entities: entities.map(e => e.entity_id), ...look,
      }),
    },
    {
      path: 'covers', icon: 'mdi:window-shutter', title: t(hass, 'covers'),
      // What happened today, beside the tiles
      activity: true,
      // Shading and awnings: garage doors and window drives belong to security, so "all down" never moves them
      pick: (e: HassEntity) => domainOf(e.entity_id) === 'cover' && ['shading', 'awning'].includes(coverKind(e)),
      // Blinds and awnings of a room each get their own heading, so up/down never mixes with out/in
      split: (e: HassEntity) => coverKind(e),
      count_label: 'n_open', action: { label: 'all_close', icon: 'mdi:arrow-down', service: 'close_cover' },
    },
    {
      path: 'security', icon: 'mdi:shield-home-outline', title: t(hass, 'security'),
      // What happened today, beside the tiles
      activity: true,
      pick: (e: HassEntity) => SECURITY_GROUPS.includes(groupOf(e)!), count_label: 'n_open',
      // Motion and smoke are not "open"; only openings, gates and locks count
      counts: (e: HassEntity) => ['opening', 'gate', 'lock'].includes(groupOf(e)!),
    },
    {
      path: 'cameras', icon: 'mdi:cctv', title: t(hass, 'cameras'),
      pick: ofDomain('camera'),
      // The pictures side by side and what they saw today, instead of one section per room
      whole: (): Card[] => [{ type: 'custom:ad-cameras', cameras: cameraInfos, nav_position: position, ...look }],
    },
  ]
    .filter(page => pageAllowed(page.path as PagePath))
    .map(page => ({ ...page, entities: all.filter(page.pick) }))
    .filter(page => page.entities.length)

  // Calendars rarely belong to a room, so the page takes them from the whole house
  const calendars = config.hide_domains?.includes('calendar') || !pageAllowed('calendar') ? []
    : config.calendars?.length ? favoriteEntities(hass, config.calendars).filter(ofDomain('calendar'))
    // A school timetable has a card of its own; on the household's calendar its lessons would bury everything else
    : allEntities(hass, hide).filter(e => ofDomain('calendar')(e) && !claimed.has(e.entity_id))
  // Lists, like calendars, belong to the household: picked ones in their order, else every visible one.
  // Admins get the page without lists too, to add the first one.
  const listsPage = !config.hide_domains?.includes('todo') && pageAllowed('lists')
  const todos = !listsPage ? []
    : config.todo_lists?.length ? favoriteEntities(hass, config.todo_lists).filter(ofDomain('todo'))
    : allEntities(hass, hide).filter(ofDomain('todo'))
  const hasLists = listsPage && (todos.length > 0 || (!!hass.user?.is_admin && !config.todo_lists?.length))
  // Music, like the lists, belongs to the house: Music Assistant's speakers and the Spotify accounts, wherever they stand.
  // Without Music Assistant there is no library to show, so no page.
  const musicPlayers = config.hide_domains?.includes('media_player') || !pageAllowed('music') ? [] : findMusicPlayers(hass, hide)
  const hasMusic = musicPlayers.some(p => p.ma)
  const navItems: NavItem[] = [
    { path: 'home', icon: 'mdi:home-outline', label: t(hass, 'home') },
    ...domainPages.map(p => ({ path: p.path, icon: p.icon, label: p.title })),
    ...(hasMusic ? [{ path: 'music', icon: 'mdi:music', label: t(hass, 'music') }] : []),
    ...(calendars.length ? [{ path: 'calendar', icon: 'mdi:calendar-month-outline', label: t(hass, 'calendar') }] : []),
    ...(hasLists ? [{ path: 'lists', icon: 'mdi:clipboard-list-outline', label: t(hass, 'todos') }] : []),
    // Admins reach maintenance from the bar; others through the battery and unavailable chips
    ...(hasMaintenance && hass.user?.is_admin ? [{ path: 'maintenance', icon: 'mdi:wrench-outline', label: t(hass, 'maintenance') }] : []),
  ]
  // The face sits with the nav bar, which is on every page; a user's own face wins over the dashboard's
  const faceConfig = faceFor(config, rule, personal)
  const face: FaceSettings | undefined = faceConfig ? {
    after: Math.max(0, Number(faceConfig.after ?? 120) || 0),
    style: faceConfig.style ?? 'clock',
    ...(weather ? { weather } : {}),
    ...(weatherSensors(hass, config.weather_sensors)?.temperature ? { temperature: weatherSensors(hass, config.weather_sensors)!.temperature } : {}),
    ...(calendars.length ? { calendars: calendars.map(e => e.entity_id) } : {}),
    ...(config.background_image?.trim() ? { image: config.background_image.trim() } : {}),
    // Washer, dryer, dishwasher: the face shows them while they run or wait to be emptied
    ...(appliances.length ? { appliances } : {}),
  } : undefined
  // Popups (the doorbell's camera and the door's buttons) open on every page, so the nav bar carries them like the face
  const popups = resolvePopups(hass, config.popups)
  const nav = fullWidth([{
    type: 'custom:ad-nav-bar', items: navItems.filter(i => !ownHidden.has(i.path)), position, ...(config.ha_colors === false ? { ha_colors: false } : {}),
    ...(face ? { face } : {}), ...(popups.length ? { popups } : {}), ...look,
  }])
  // The nav card also reserves room for the floating bar, so it goes where the bar sits
  const withNav = (sections: Section[]) => position === 'top' ? [nav, ...sections] : [...sections, nav]
  const has = (path: string) => domainPages.some(p => p.path === path) && !ownHidden.has(path) ? path : undefined
  const scopeOpts = { ...hideOpts, ...(areaIds ? { areas: areaIds } : {}), ...look }
  const subview = (path: string, title: string, icon: string, sections: Section[]): View => ({
    type: 'sections', title, path, icon, subview: true, back_path: `/${dashboardPath()}/home`, max_columns: MAX_COLUMNS,
    sections: withNav([fullWidth([{ type: 'custom:ad-header', variant: 'page', title, ...look }]), ...sections]),
  })

  // Two cards share one row where there is room; a single card stands on its own
  const side = (cards: Card[], options: { widths?: number[]; align?: 'center' } = {}): Card[] =>
    cards.length > 1 ? [{ type: 'custom:ad-row', cards, ...options, ...look }] : cards

  const favoritesSection = (cards: Card[], inRoom = false): Section[] => cards.length ? [{
    type: 'grid',
    column_span: inRoom ? 1 : MAX_COLUMNS,
    cards: [{ type: 'custom:ad-group-heading', title: t(hass, 'favorites'), icon: 'mdi:star-outline', entities: [], ...look }, ...cards],
  }] : []
  const schoolCard = (school: School, full = false): Card => ({
    type: 'custom:ad-school', school, ...(full ? { full: true } : school.area ? { path: areaPath(school.area) } : {}), ...look,
  })
  const roomCard = (area: (typeof areas)[number]): Card =>
    ({ type: 'custom:ad-room-card', area: area.area_id, path: areaPath(area.area_id), ...hideOpts, ...look })
  // On Home the favorites in the user's order: devices as tiles, rooms as room cards
  const homeFavorites = (config.favorites ?? []).flatMap((id): Card[] => {
    if (isRoomFavorite(id)) {
      const area = areas.find(a => a.area_id === id)
      return area ? [roomCard(area)] : []
    }
    const entity = favorites.find(e => e.entity_id === id)
    return entity ? [tile(entity)] : []
  })
  const roomSections = (area: (typeof areas)[number]): Section[] => {
    const room = config.rooms?.[area.area_id] ?? {}
    // Own cards are plain Lovelace configs, passed through untouched
    const own = (slot: CardSlot) => room.cards?.[slot] ?? []
    return [
      ...ownSections(own('top')),
      ...favoritesSection(favorites.filter(e => entityAreaId(hass, e.entity_id) === area.area_id).map(e => tile(e, area.name)), true),
      // A pupil's day: every lesson, cancelled and changed ones marked
      ...schools.filter(s => s.area === area.area_id).map((s): Section => ({ type: 'grid', cards: [schoolCard(s, true)] })),
      ...cameraInfos.filter(c => c.area === area.area_id).map((c): Section => ({ type: 'grid', cards: [cameraCard(hass.states[c.entity]!, area.name, c.name)] })),
      ...tvs.filter(tv => tv.area === area.area_id).map((tv): Section => ({ type: 'grid', cards: [{ type: 'custom:ad-tv', tv, apps: tvApps(config.tv_apps), ...look }] })),
      ...(appliances.some(a => a.area === area.area_id) ? [{
        type: 'grid' as const,
        cards: [
          { type: 'custom:ad-group-heading', title: t(hass, 'appliances'), entities: [], ...look },
          ...appliances.filter(a => a.area === area.area_id).map(a => applianceCard(a)),
        ],
      }] : []),
      ...arrangeRoom(groupEntities(areaEntities(hass, area.area_id, hide).filter(e => !claimed.has(e.entity_id))), room).map(([key, entities]): Section => ({
        type: 'grid',
        cards: [groupHeading(t(hass, `group.${key}`), entities), ...entities.map(e => tile(e, area.name)), ...own(key)],
      })),
      ...ownSections(own('bottom')),
    ]
  }
  const singleRoom = scoped && areas.length === 1 ? areas[0] : undefined

  const home: View = {
    type: 'sections',
    title: t(hass, 'home'),
    path: 'home',
    icon: 'mdi:home-outline',
    max_columns: MAX_COLUMNS,
    sections: withNav([
      fullWidth([
        { type: 'custom:ad-header', variant: 'home', ...(weather ? { weather: false } : {}), ...(allowPersonal ? { settings: 'settings' } : {}), ...look },
        {
          type: 'custom:ad-status-bar', ...scopeOpts,
          // Cancelled and changed lessons as chips of their own
          ...(schools.length && !hiddenChips.includes('school') ? { schools } : {}), ...chipOpts,
          ...(events ? { events } : {}),
          links: {
            lights: has('lights'), openings: has('security'), unlocked: has('security'), heating: has('climate'),
            battery: hasMaintenance ? 'maintenance' : undefined, unavailable: hasMaintenance ? 'maintenance' : undefined,
          },
        },
        // On wide screens two to a row, so the rooms come into view sooner: weather beside inside and power,
        // now playing beside the scenes. Phones stack them.
        ...side([
          ...(weather ? [{
            type: 'custom:ad-weather', entity: weather, ...(config.weather_warnings?.length ? { warnings: config.weather_warnings } : {}),
            ...(weatherSensors(hass, config.weather_sensors) ? { sensors: weatherSensors(hass, config.weather_sensors) } : {}),
            ...(config.forecast_days !== undefined ? { days: config.forecast_days } : {}), ...look,
          }] : []),
          ...(showClimate || hasEnergy ? [{
            type: 'custom:ad-house-info', areas: indoor.map(a => a.area_id), ...(outsideTile.length ? { outdoor: outsideTile } : {}), ...hideOpts, ...look,
            ...sourceOpts, links: { climate: has('climate'), energy: hasEnergy ? 'energy' : undefined },
          }] : []),
        ], { widths: [2, 1] }),
        // Now playing hides itself while nothing plays
        ...side([
          { type: 'custom:ad-now-playing', ...scopeOpts },
          ...(scenes.length ? [{ type: 'custom:ad-scenes', entities: scenes.map(e => e.entity_id), ...look }] : []),
        ], { align: 'center' }),
        // Each shows only while its appliance runs, waits to be emptied or needs someone
        ...appliances.map(a => applianceCard(a, true)),
        // The children's school day side by side: what's on now, or when school starts next time
        ...(config.school_home === false ? [] : side(schools.map(s => schoolCard(s)))),
      ]),
      ...(singleRoom ? [] : favoritesSection(homeFavorites)),
      // One room: its content right on the home page instead of a single room card
      ...(singleRoom ? roomSections(singleRoom) : []),
      // Span 2: room cards (6 columns) sit 4-up on wide screens and 2-up on phones
      ...(singleRoom ? [] : floors).map((group): Section => ({
        type: 'grid',
        column_span: 2,
        cards: [
          heading(group.floor?.name ?? (floors.length > 1 ? t(hass, 'other_rooms') : t(hass, 'rooms'))),
          ...group.areas.map(roomCard),
        ],
      })),
    ]),
  }

  // Admins also see HA itself: the server, repairs, failing integrations, the log, backups and updates.
  // HA answers these websocket calls for admins only, so others keep batteries and unavailable devices.
  const isAdmin = !!hass.user?.is_admin
  // The server's load runs across the page, the short blocks (backups, repairs, integrations, updates) share a row,
  // batteries and unavailable devices take half each, and the long log runs across at the end. HA packs sections
  // densely, so with two, three or four columns at most one column stays empty
  const system = (source: string, title: string, icon: string, span = 1): Section =>
    ({ type: 'grid', column_span: span, cards: [heading(title, icon), { type: 'custom:ad-system', source, ...look }] })
  const maintenanceView = subview('maintenance', t(hass, 'maintenance'), 'mdi:wrench-outline', [
    ...(isAdmin ? [
      system('health', t(hass, 'sys.system'), 'mdi:server-outline', MAX_COLUMNS),
      system('backup', t(hass, 'sys.backups'), 'mdi:backup-restore'),
      system('repairs', t(hass, 'sys.repairs'), 'mdi:auto-fix'),
      system('integrations', t(hass, 'sys.integrations'), 'mdi:puzzle-outline'),
      { type: 'grid' as const, column_span: 1, cards: [heading(t(hass, 'updates'), 'mdi:package-up'), { type: 'custom:ad-maintenance-list', source: 'updates', ...scopeOpts }] },
    ] : []),
    { type: 'grid', column_span: 2, cards: [heading(t(hass, 'batteries'), 'mdi:battery-50'), { type: 'custom:ad-maintenance-list', source: 'battery', ...scopeOpts }] },
    { type: 'grid', column_span: 2, cards: [heading(t(hass, 'status.unavailable'), 'mdi:lan-disconnect'), { type: 'custom:ad-maintenance-list', source: 'unavailable', ...scopeOpts }] },
    ...(isAdmin ? [system('log', t(hass, 'sys.log'), 'mdi:text-box-search-outline', MAX_COLUMNS)] : []),
  ])

  const calendarView = subview('calendar', t(hass, 'calendar'), 'mdi:calendar-month-outline', [
    fullWidth([{ type: 'custom:ad-calendar', entities: calendars.map(e => e.entity_id), ...(config.calendar_edit === false ? { edit: false } : {}), ...look }]),
  ])

  // One card for all lists, so one added or deleted on the page shows without reloading
  const listsView = subview('lists', t(hass, 'todos'), 'mdi:clipboard-list-outline', [
    fullWidth([{ type: 'custom:ad-lists', ...(config.todo_lists?.length ? { entities: todos.map(e => e.entity_id) } : hideOpts), ...look }]),
  ])

  const musicView = subview('music', t(hass, 'music'), 'mdi:music', [
    fullWidth([{
      type: 'custom:ad-music', players: musicPlayers, nav_position: position, ...look,
      // A Sonos or Cast speaker lists every Spotify account in its media browser, even while nothing plays
      ...(musicPlayers.some(p => p.spotify) ? { spotify_browsers: findSpotifyBrowsers(hass) } : {}),
    }]),
  ])

  // The user's own settings: what the dashboard has set is the starting point, and what "reset" goes back to
  const settingsView = subview('settings', t(hass, 'settings'), 'mdi:cog-outline', [
    fullWidth([{
      type: 'custom:ad-settings', dashboard: dashboardPath(), ...look,
      base: {
        theme: baseConfig.theme ?? 'auto', glass: !!baseConfig.glass, primary_color: isHexColor(baseConfig.primary_color) ? baseConfig.primary_color : undefined,
        nav_position: baseConfig.nav_position ?? 'bottom', face: faceFor(baseConfig, rule) ?? false, favorites: baseConfig.favorites ?? [],
      },
      pages: navItems.filter(i => i.path !== 'home').map(({ path, icon, label }) => ({ path, icon, label })),
      ...(rule?.face === false ? { face_locked: true } : {}),
      ...(areaIds ? { areas: areaIds } : {}), ...hideOpts,
      rooms: areas.map(a => a.area_id),
    }]),
  ])

  // Energy: the house, then per floor each room's sensors next to a graph of the last day
  const powerOpts = { ...hideOpts, ...look }
  const energyView = subview('energy', t(hass, 'energy'), 'mdi:lightning-bolt-outline', [
    // The house sum spans the whole page, however many columns the floors below get
    fullWidth([{ type: 'custom:ad-power', variant: 'house', areas: indoor.map(a => a.area_id), ...sourceOpts, ...powerOpts }]),
    ...floors.map((group): Section => {
      const cards = group.areas.flatMap(area => {
        const sensors = areaEntities(hass, area.area_id, hide).filter(isPower)
        if (!sensors.length) return []
        // Card and graph each take the full row: HA packs sections densely and would otherwise
        // slide the next room's card next to this room's graph. The history graph needs no long-term statistics.
        return [
          { type: 'custom:ad-power', variant: 'room', areas: [area.area_id], wide: true, ...powerOpts },
          // The legend grows with the sensors; the plot keeps about four rows of its own
          { type: 'history-graph', entities: sensors.map(e => e.entity_id), hours_to_show: 24, grid_options: { columns: 'full', rows: Math.min(10, 4 + Math.ceil(sensors.length / 2)) } },
        ]
      })
      return { type: 'grid', column_span: 2, cards: cards.length ? [heading(group.floor?.name ?? t(hass, 'other_rooms')), ...cards] : [] }
    }).filter(section => section.cards.length),
  ])

  const roomViews: View[] = areas.map(area => {
    return {
      type: 'sections',
      title: area.name,
      path: areaPath(area.area_id),
      icon: area.icon ?? undefined,
      subview: true,
      back_path: `/${dashboardPath()}/home`,
      max_columns: MAX_COLUMNS,
      sections: withNav([
        fullWidth([
          { type: 'custom:ad-room-header', area: area.area_id, ...hideOpts, ...look },
          // The home page's chips, counted for this room only
          {
            type: 'custom:ad-status-bar', ...hideOpts, areas: [area.area_id], people: false, presence: true, ...look, ...chipOpts, ...roomEvents(area.area_id),
            ...(schools.some(s => s.area === area.area_id) && !hiddenChips.includes('school') ? { schools: schools.filter(s => s.area === area.area_id) } : {}),
          },
        ]),
        ...roomSections(area),
      ]),
    }
  })

  // A room's shown entities as a set, built once for all domain pages
  const roomSets = new Map<string, Set<HassEntity>>()
  const roomSet = (areaId: string) => {
    let set = roomSets.get(areaId)
    if (!set) roomSets.set(areaId, (set = new Set(areaEntities(hass, areaId, hide))))
    return set
  }
  const domainViews: View[] = domainPages.map(page => {
    const inArea = (areaId: string) => {
      const here = roomSet(areaId)
      return page.entities.filter(e => here.has(e))
    }
    // One section per floor with a subtitle per room, so single-entity rooms don't each fill a section
    const floorSections: Section[] = floors.map(group => {
      const rooms = group.areas.map(area => ({ area, entities: inArea(area.area_id) })).filter(r => r.entities.length)
      return {
        type: 'grid' as const,
        column_span: 2,
        cards: rooms.length ? [
          heading(group.floor?.name ?? t(hass, 'other_rooms')),
          ...rooms.flatMap(({ area, entities }) => {
            if (page.roomCard) return [page.roomCard(area, entities)]
            const roomHeading = { icon: area.icon ?? undefined, path: areaPath(area.area_id), sub: true }
            const tiles = (list: HassEntity[]) => list.map(e => tile(e, area.name))
            const kinds = page.split ? [...new Set(entities.map(page.split))] : []
            if (kinds.length < 2) return [groupHeading(area.name, entities, roomHeading), ...tiles(entities)]
            // Several kinds in one room: the room heading only names it, each kind brings its own control
            return [
              groupHeading(area.name, [], roomHeading),
              ...kinds.flatMap(kind => {
                const ofKind = entities.filter(e => page.split!(e) === kind)
                return [groupHeading(t(hass, `group.${kind}` as Key), ofKind, { minor: true }), ...tiles(ofKind)]
              }),
            ]
          }),
        ] : [],
      }
    }).filter(section => section.cards.length)
    const placed = new Set(areas.flatMap(area => inArea(area.area_id)))
    const rest = page.entities.filter(e => !placed.has(e))
    const content: Section[] = page.whole ? [fullWidth(page.whole())] : [
      ...floorSections,
      ...(rest.length ? [{ type: 'grid' as const, column_span: 2, cards: [heading(t(hass, 'other_rooms')), ...rest.map(e => tile(e))] }] : []),
    ]
    // With today's changes beside them, the floors go into one section two columns wide and the list takes the third.
    // Phones stack them: the tiles first, the list beneath.
    const withActivity = 'activity' in page && page.activity && !page.whole
    const sections: Section[] = withActivity ? [
      { type: 'grid', column_span: 2, cards: content.flatMap(section => section.cards) },
      { type: 'grid', column_span: 1, cards: [{ type: 'custom:ad-activity', entities: page.entities.map(e => e.entity_id), nav_position: position, ...look }] },
    ] : content
    // Subviews like the rooms: with only Home as a top-level view HA shows no tab bar,
    // and the nav bar is the one navigation
    return {
      type: 'sections',
      title: page.title,
      path: page.path,
      icon: page.icon,
      subview: true,
      back_path: `/${dashboardPath()}/home`,
      max_columns: withActivity ? 3 : MAX_COLUMNS,
      sections: withNav([
        fullWidth([{
          type: 'custom:ad-header', variant: 'page', title: page.title, ...look,
          entities: page.entities.filter(page.counts ?? (() => true)).map(e => e.entity_id),
          ...(page.count_label ? { count_label: page.count_label } : {}),
          ...(page.action ? { action: page.action } : {}),
        }]),
        ...sections,
      ]),
    }
  })

  // With an own accent the page behind the cards follows it too; without, HA's theme stays in charge.
  // Glass needs something to blur, so it brings its own lit backdrop.
  const background = config.background_image?.trim() ? imageBackground(config.background_image, config.theme)
    : look.glass ? glassBackground(look.primary_color, config.theme)
    : look.primary_color ? pageBackground(look.primary_color, config.theme) : undefined
  // Own cards (pages: <page>: cards: top/bottom) go below the page's header and at its end, like a room's
  const withOwnCards = (view: View): View => {
    const cards = config.pages?.[String(view.path) as OwnCardsPage]?.cards
    if (!cards?.top?.length && !cards?.bottom?.length) return view
    const sections = [...(view.sections as Section[])]
    const navAt = sections.findIndex(s => s.cards.some(c => c.type === 'custom:ad-nav-bar'))
    const navTop = navAt === 0
    // Two columns wide, like the lists on the pages: two cards side by side on a wide screen
    const own = (list?: Card[]) => ownSections(list, 2)
    const headerAt = navTop ? 1 : 0
    sections.splice(headerAt + 1, 0, ...own(cards.top))
    const end = navTop ? sections.length : sections.length - 1
    sections.splice(end, 0, ...own(cards.bottom))
    return { ...view, sections }
  }
  const views = [home, ...domainViews, ...(hasMusic ? [musicView] : []), ...(calendars.length ? [calendarView] : []), ...(hasLists ? [listsView] : []), ...(hasEnergy ? [energyView] : []), ...(hasMaintenance ? [maintenanceView] : []), ...(allowPersonal ? [settingsView] : []), ...roomViews]
    .filter(view => !ownHidden.has(String(view.path)))
    .map(withOwnCards)
  return {
    title: config.title ?? t(hass, 'home'),
    // kiosk-mode reads its options from the generated dashboard, not from the strategy, so they go along unchanged
    ...(rawConfig.kiosk_mode ? { kiosk_mode: rawConfig.kiosk_mode } : {}),
    views: background ? views.map((view): View => ({ ...view, background })) : views,
  }
}
