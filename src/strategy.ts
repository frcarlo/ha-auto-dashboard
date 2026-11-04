import { accessOf, intersect, ruleFor } from './access'
import { t } from './i18n'
import { allEntities, areaEntities, floorsWithAreas, groupEntities, groupOf } from './model'
import { OPENING_CLASSES, domainOf } from './presentation'
import type { NavItem } from './cards/nav-bar'
import type { HassEntity, HomeAssistant, PagePath, StrategyConfig } from './types'

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
export async function generateDashboard(baseConfig: StrategyConfig, hass: HomeAssistant) {
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
    ...(access !== 'full' ? { access } : {}),
  }
  const hide = config.hide_domains ?? []
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
  const scopeLabel = !scoped ? undefined
    : config.floors?.length && !config.areas?.length
      ? floors.map(f => f.floor?.name).filter(Boolean).join(', ')
      : areas.map(a => a.name).join(', ')
  const position = config.nav_position ?? 'bottom'

  const tile = (entity: HassEntity, areaName?: string): Card =>
    ({ type: 'custom:ad-tile', entity: entity.entity_id, ...(areaName ? { area_name: areaName } : {}), ...look })

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
    },
    {
      path: 'covers', icon: 'mdi:window-shutter', title: t(hass, 'covers'),
      pick: (e: HassEntity) => domainOf(e.entity_id) === 'cover',
      count_label: 'n_open', action: { label: 'all_close', icon: 'mdi:arrow-down', service: 'close_cover' },
    },
    {
      path: 'security', icon: 'mdi:shield-home-outline', title: t(hass, 'security'),
      pick: (e: HassEntity) => groupOf(e) === 'security', count_label: 'n_open',
      // Motion and smoke are not "open"; only openings and locks count
      counts: (e: HassEntity) => domainOf(e.entity_id) === 'lock' || OPENING_CLASSES.includes(e.attributes.device_class),
    },
  ]
    .filter(page => !rule?.hide_pages?.includes(page.path as PagePath))
    .map(page => ({ ...page, entities: all.filter(page.pick) }))
    .filter(page => page.entities.length)

  const navItems: NavItem[] = [
    { path: 'home', icon: 'mdi:home-outline', label: t(hass, 'home') },
    ...domainPages.map(p => ({ path: p.path, icon: p.icon, label: p.title })),
  ]
  const nav = fullWidth([{ type: 'custom:ad-nav-bar', items: navItems, position, ...look }])
  // The nav card also reserves room for the floating bar, so it goes where the bar sits
  const withNav = (sections: Section[]) => position === 'top' ? [nav, ...sections] : [...sections, nav]
  const has = (path: string) => domainPages.some(p => p.path === path) ? path : undefined

  const roomSections = (area: (typeof areas)[number]): Section[] =>
    [...groupEntities(areaEntities(hass, area.area_id, hide))].map(([key, entities]) => ({
      type: 'grid',
      cards: [heading(t(hass, `group.${key}`)), ...entities.map(e => tile(e, area.name))],
    }))
  const singleRoom = scoped && areas.length === 1 ? areas[0] : undefined

  const home: View = {
    type: 'sections',
    title: t(hass, 'home'),
    path: 'home',
    icon: 'mdi:home-outline',
    max_columns: MAX_COLUMNS,
    sections: withNav([
      fullWidth([
        { type: 'custom:ad-header', variant: 'home', ...(scopeLabel ? { scope: scopeLabel } : {}), ...look },
        {
          type: 'custom:ad-status-bar', hide_domains: hide, ...(areaIds ? { areas: areaIds } : {}), ...look,
          links: { lights: has('lights'), openings: has('security'), unlocked: has('security'), heating: has('climate') },
        },
      ]),
      // One room: its content right on the home page instead of a single room card
      ...(singleRoom ? roomSections(singleRoom) : []),
      // Span 2: room cards (6 columns) sit 4-up on wide screens and 2-up on phones
      ...(singleRoom ? [] : floors).map((group): Section => ({
        type: 'grid',
        column_span: 2,
        cards: [
          heading(group.floor?.name ?? (floors.length > 1 ? t(hass, 'other_rooms') : t(hass, 'rooms')), group.floor?.icon),
          ...group.areas.map(area => ({ type: 'custom:ad-room-card', area: area.area_id, path: areaPath(area.area_id), hide_domains: hide, ...look })),
        ],
      })),
    ]),
  }

  const roomViews: View[] = areas.map(area => {
    const lights = areaEntities(hass, area.area_id, hide).filter(e => domainOf(e.entity_id) === 'light')
    return {
      type: 'sections',
      title: area.name,
      path: areaPath(area.area_id),
      icon: area.icon ?? undefined,
      subview: true,
      back_path: `/${dashboardPath()}/home`,
      max_columns: MAX_COLUMNS,
      sections: withNav([
        fullWidth([{
          type: 'custom:ad-header', variant: 'page', title: area.name, icon: area.icon ?? undefined, ...look,
          ...(lights.length ? { entities: lights.map(e => e.entity_id), count_label: 'n_on', action: domainPages[0]?.action } : {}),
        }]),
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
          heading(group.floor?.name ?? t(hass, 'other_rooms'), group.floor?.icon),
          ...rooms.flatMap(({ area, entities }) => [
            heading(area.name, area.icon, areaPath(area.area_id), 'subtitle'),
            ...entities.map(e => tile(e, area.name)),
          ]),
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
          type: 'custom:ad-header', variant: 'page', title: page.title, icon: page.icon, ...look,
          entities: page.entities.filter(page.counts ?? (() => true)).map(e => e.entity_id),
          ...(page.count_label ? { count_label: page.count_label } : {}),
          ...(page.action ? { action: page.action } : {}),
        }]),
        ...floorSections,
        ...(rest.length ? [{ type: 'grid' as const, column_span: 2, cards: [heading(t(hass, 'other_rooms')), ...rest.map(e => tile(e))] }] : []),
      ]),
    }
  })

  return {
    title: config.title ?? scopeLabel ?? t(hass, 'home'),
    views: [home, ...domainViews, ...roomViews],
  }
}
