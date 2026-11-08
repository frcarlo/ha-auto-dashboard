import { accessOf, intersect, ruleFor } from './access'
import { normalizeConfig } from './config'
import { t, type Key } from './i18n'
import {
  SECURITY_GROUPS, allEntities, areaEntities, arrangeRoom, averageClimate, hideOf, bulkControl, coverKind, entityAreaId, favoriteEntities,
  floorsWithAreas, groupEntities, groupOf, isPower, powerSources, sceneEntities, type EnergyPrefs,
} from './model'
import { domainOf, entityName, shortName } from './presentation'
import { weatherEntity, weatherSensors } from './weather'
import { applianceEntities, findAppliances, findTvs } from './appliances'
import { findCameras } from './cameras'
import { tvApps } from './tv-apps'
import { glassBackground, imageBackground, isHexColor, pageBackground } from './styles/palette'
import type { NavItem } from './cards/nav-bar'
import type { FaceSettings } from './cards/face'
import type { AreaRegistryEntry, CardSlot, HassEntity, HomeAssistant, PagePath, StrategyConfig } from './types'

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

/** Build the generated dashboard. Runs in the browser whenever the dashboard loads. */
export async function generateDashboard(rawConfig: StrategyConfig, hass: HomeAssistant) {
  const baseConfig = normalizeConfig(rawConfig)
  // The viewing user's rule narrows rooms and pages on top of the dashboard's own filter.
  // HA runs the strategy in each browser with that browser's user, so every user gets their own dashboard.
  const rule = ruleFor(baseConfig.users, hass.user)
  const access = accessOf(rule)
  const config: StrategyConfig = {
    ...baseConfig,
    areas: intersect(baseConfig.areas, rule?.areas),
    floors: intersect(baseConfig.floors, rule?.floors),
  }
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

  const tile = (entity: HassEntity, areaName?: string): Card =>
    ({ type: 'custom:ad-tile', entity: entity.entity_id, ...(areaName ? { area_name: areaName } : {}), ...look })
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
  const claimed = new Set([
    ...appliances.flatMap(a => applianceEntities(hass, a)),
    ...tvs.flatMap(tv => [tv.entity, ...(tv.remote ? [tv.remote] : []), ...tv.others]),
  ])
  const applianceCard = (appliance: (typeof appliances)[number], home = false): Card =>
    ({ type: 'custom:ad-appliance', appliance, ...(home ? { only_active: true } : {}), ...look })
  const outdoor = config.outdoor_areas ?? []
  const indoor = areas.filter(a => !outdoor.includes(a.area_id))
  const pageAllowed = (path: PagePath) => !rule?.hide_pages?.includes(path)
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
      // Shading and awnings: garage doors and window drives belong to security, so "all down" never moves them
      pick: (e: HassEntity) => domainOf(e.entity_id) === 'cover' && ['shading', 'awning'].includes(coverKind(e)),
      // Blinds and awnings of a room each get their own heading, so up/down never mixes with out/in
      split: (e: HassEntity) => coverKind(e),
      count_label: 'n_open', action: { label: 'all_close', icon: 'mdi:arrow-down', service: 'close_cover' },
    },
    {
      path: 'security', icon: 'mdi:shield-home-outline', title: t(hass, 'security'),
      pick: (e: HassEntity) => SECURITY_GROUPS.includes(groupOf(e)!), count_label: 'n_open',
      // Motion and smoke are not "open"; only openings, gates and locks count
      counts: (e: HassEntity) => ['opening', 'gate', 'lock'].includes(groupOf(e)!),
    },
    {
      path: 'cameras', icon: 'mdi:cctv', title: t(hass, 'cameras'),
      pick: ofDomain('camera'),
      // The pictures side by side and what they saw today, instead of one section per room
      whole: (): Card[] => [{ type: 'custom:ad-cameras', cameras: cameraInfos, ...look }],
    },
  ]
    .filter(page => !rule?.hide_pages?.includes(page.path as PagePath))
    .map(page => ({ ...page, entities: all.filter(page.pick) }))
    .filter(page => page.entities.length)

  // Calendars rarely belong to a room, so the page takes them from the whole house
  const calendars = config.hide_domains?.includes('calendar') || !pageAllowed('calendar') ? []
    : config.calendars?.length ? favoriteEntities(hass, config.calendars).filter(ofDomain('calendar'))
    : allEntities(hass, hide).filter(ofDomain('calendar'))
  // Lists, like calendars, belong to the household: picked ones in their order, else every visible one.
  // Admins get the page without lists too, to add the first one.
  const listsPage = !config.hide_domains?.includes('todo') && pageAllowed('lists')
  const todos = !listsPage ? []
    : config.todo_lists?.length ? favoriteEntities(hass, config.todo_lists).filter(ofDomain('todo'))
    : allEntities(hass, hide).filter(ofDomain('todo'))
  const hasLists = listsPage && (todos.length > 0 || (!!hass.user?.is_admin && !config.todo_lists?.length))
  const navItems: NavItem[] = [
    { path: 'home', icon: 'mdi:home-outline', label: t(hass, 'home') },
    ...domainPages.map(p => ({ path: p.path, icon: p.icon, label: p.title })),
    ...(calendars.length ? [{ path: 'calendar', icon: 'mdi:calendar-month-outline', label: t(hass, 'calendar') }] : []),
    ...(hasLists ? [{ path: 'lists', icon: 'mdi:clipboard-list-outline', label: t(hass, 'todos') }] : []),
  ]
  // The face sits with the nav bar, which is on every page; a user's own face wins over the dashboard's
  const faceConfig = rule?.face === false ? undefined : rule?.face || config.face ? { ...config.face, ...(rule?.face || {}) } : undefined
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
  const nav = fullWidth([{ type: 'custom:ad-nav-bar', items: navItems, position, ...(config.ha_colors === false ? { ha_colors: false } : {}), ...(face ? { face } : {}), ...look }])
  // The nav card also reserves room for the floating bar, so it goes where the bar sits
  const withNav = (sections: Section[]) => position === 'top' ? [nav, ...sections] : [...sections, nav]
  const has = (path: string) => domainPages.some(p => p.path === path) ? path : undefined
  const scopeOpts = { ...hideOpts, ...(areaIds ? { areas: areaIds } : {}), ...look }
  const subview = (path: string, title: string, icon: string, sections: Section[]): View => ({
    type: 'sections', title, path, icon, subview: true, back_path: `/${dashboardPath()}/home`, max_columns: MAX_COLUMNS,
    sections: withNav([fullWidth([{ type: 'custom:ad-header', variant: 'page', title, ...look }]), ...sections]),
  })

  // Two cards share one row where there is room; a single card stands on its own
  const side = (cards: Card[], options: { widths?: number[]; align?: 'center' } = {}): Card[] =>
    cards.length > 1 ? [{ type: 'custom:ad-row', cards, ...options, ...look }] : cards

  const favoritesSection = (entities: HassEntity[], areaName?: string): Section[] => entities.length ? [{
    type: 'grid',
    column_span: areaName ? 1 : MAX_COLUMNS,
    cards: [
      { type: 'custom:ad-group-heading', title: t(hass, 'favorites'), icon: 'mdi:star-outline', entities: [], ...look },
      ...entities.map(e => tile(e, areaName)),
    ],
  }] : []
  const roomSections = (area: (typeof areas)[number]): Section[] => {
    const room = config.rooms?.[area.area_id] ?? {}
    // Own cards are plain Lovelace configs, passed through untouched
    const own = (slot: CardSlot) => room.cards?.[slot] ?? []
    return [
      ...(own('top').length ? [{ type: 'grid' as const, cards: own('top') }] : []),
      ...favoritesSection(favorites.filter(e => entityAreaId(hass, e.entity_id) === area.area_id), area.name),
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
      ...(own('bottom').length ? [{ type: 'grid' as const, cards: own('bottom') }] : []),
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
        { type: 'custom:ad-header', variant: 'home', ...(weather ? { weather: false } : {}), ...look },
        {
          type: 'custom:ad-status-bar', ...scopeOpts,
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
      ]),
      ...(singleRoom ? [] : favoritesSection(favorites)),
      // One room: its content right on the home page instead of a single room card
      ...(singleRoom ? roomSections(singleRoom) : []),
      // Span 2: room cards (6 columns) sit 4-up on wide screens and 2-up on phones
      ...(singleRoom ? [] : floors).map((group): Section => ({
        type: 'grid',
        column_span: 2,
        cards: [
          heading(group.floor?.name ?? (floors.length > 1 ? t(hass, 'other_rooms') : t(hass, 'rooms'))),
          ...group.areas.map(area => ({ type: 'custom:ad-room-card', area: area.area_id, path: areaPath(area.area_id), ...hideOpts, ...look })),
        ],
      })),
    ]),
  }

  const maintenanceView = subview('maintenance', t(hass, 'maintenance'), 'mdi:wrench-outline', [
    { type: 'grid', column_span: 2, cards: [heading(t(hass, 'batteries'), 'mdi:battery-50'), { type: 'custom:ad-maintenance-list', source: 'battery', ...scopeOpts }] },
    { type: 'grid', column_span: 2, cards: [heading(t(hass, 'status.unavailable'), 'mdi:lan-disconnect'), { type: 'custom:ad-maintenance-list', source: 'unavailable', ...scopeOpts }] },
    // Only admins can install updates
    ...(hass.user?.is_admin ? [{ type: 'grid' as const, column_span: 2, cards: [heading(t(hass, 'updates'), 'mdi:package-up'), { type: 'custom:ad-maintenance-list', source: 'updates', ...scopeOpts }] }] : []),
  ])

  const calendarView = subview('calendar', t(hass, 'calendar'), 'mdi:calendar-month-outline', [
    fullWidth([{ type: 'custom:ad-calendar', entities: calendars.map(e => e.entity_id), ...(config.calendar_edit === false ? { edit: false } : {}), ...look }]),
  ])

  // One card for all lists, so one added or deleted on the page shows without reloading
  const listsView = subview('lists', t(hass, 'todos'), 'mdi:clipboard-list-outline', [
    fullWidth([{ type: 'custom:ad-lists', ...(config.todo_lists?.length ? { entities: todos.map(e => e.entity_id) } : hideOpts), ...look }]),
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
        fullWidth([{ type: 'custom:ad-room-header', area: area.area_id, ...hideOpts, ...look }]),
        ...roomSections(area),
      ]),
    }
  })

  const domainViews: View[] = domainPages.map(page => {
    const inArea = (areaId: string) => page.entities.filter(e => areaEntities(hass, areaId, hide).includes(e))
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
    // Subviews like the rooms: with only Home as a top-level view HA shows no tab bar,
    // and the nav bar is the one navigation
    return {
      type: 'sections',
      title: page.title,
      path: page.path,
      icon: page.icon,
      subview: true,
      back_path: `/${dashboardPath()}/home`,
      max_columns: MAX_COLUMNS,
      sections: withNav([
        fullWidth([{
          type: 'custom:ad-header', variant: 'page', title: page.title, ...look,
          entities: page.entities.filter(page.counts ?? (() => true)).map(e => e.entity_id),
          ...(page.count_label ? { count_label: page.count_label } : {}),
          ...(page.action ? { action: page.action } : {}),
        }]),
        ...(page.whole ? [fullWidth(page.whole())] : floorSections),
        ...(!page.whole && rest.length ? [{ type: 'grid' as const, column_span: 2, cards: [heading(t(hass, 'other_rooms')), ...rest.map(e => tile(e))] }] : []),
      ]),
    }
  })

  // With an own accent the page behind the cards follows it too; without, HA's theme stays in charge.
  // Glass needs something to blur, so it brings its own lit backdrop.
  const background = config.background_image?.trim() ? imageBackground(config.background_image, config.theme)
    : look.glass ? glassBackground(look.primary_color, config.theme)
    : look.primary_color ? pageBackground(look.primary_color, config.theme) : undefined
  const views = [home, ...domainViews, ...(calendars.length ? [calendarView] : []), ...(hasLists ? [listsView] : []), ...(hasEnergy ? [energyView] : []), ...(hasMaintenance ? [maintenanceView] : []), ...roomViews]
  return {
    title: config.title ?? t(hass, 'home'),
    views: background ? views.map((view): View => ({ ...view, background })) : views,
  }
}
