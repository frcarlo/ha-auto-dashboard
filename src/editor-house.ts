// The house as a cross-section for picking rooms in the editor: a roof, the floors as storeys
// (highest on top), each room a field inside its storey, rooms without a floor outside on the ground.
// A room draws its role (hidden, outdoor, shown, picked) right where it is, so one picture replaces
// the separate room lists that were easy to mix up.
import { css, html, nothing, type TemplateResult } from 'lit'
import type { AreaRegistryEntry, FloorRegistryEntry, HomeAssistant } from './types'

export type RoomMark = 'hidden' | 'outdoor' | 'only' | 'picked'

const MARK_ICONS: Partial<Record<RoomMark, string>> = {
  hidden: 'mdi:eye-off-outline',
  outdoor: 'mdi:tree-outline',
  only: 'mdi:check',
}

export interface HouseOptions {
  hass: HomeAssistant
  /** Roles drawn on a room */
  marks: (areaId: string) => RoomMark[]
  onRoom: (areaId: string) => void
  /** Spoken after the room name, e.g. "hidden" */
  markLabel: (mark: RoomMark) => string
  /** Storey names become buttons when set (e.g. "only this floor") */
  onFloor?: (floorId: string) => void
  floorPressed?: (floorId: string) => boolean
  outsideLabel: string
}

function storeys(hass: HomeAssistant) {
  const areas = Object.values(hass.areas).sort((a, b) => a.name.localeCompare(b.name))
  const floors: FloorRegistryEntry[] = Object.values(hass.floors ?? {})
    .sort((a, b) => (b.level ?? -Infinity) - (a.level ?? -Infinity) || a.name.localeCompare(b.name))
  const inside = floors.map(floor => ({ floor, areas: areas.filter(a => a.floor_id === floor.floor_id) })).filter(s => s.areas.length)
  const outside = areas.filter(a => !a.floor_id || !hass.floors?.[a.floor_id])
  return { inside, outside }
}

export function house(o: HouseOptions): TemplateResult {
  const { inside, outside } = storeys(o.hass)
  const room = (area: AreaRegistryEntry) => {
    const marks = o.marks(area.area_id)
    const spoken = marks.map(o.markLabel).join(', ')
    return html`<button class="room ${marks.join(' ')}" aria-pressed=${marks.length > 0}
      aria-label=${spoken ? `${area.name}: ${spoken}` : area.name} @click=${() => o.onRoom(area.area_id)}>
      ${marks.map(m => MARK_ICONS[m] ? html`<ha-icon icon=${MARK_ICONS[m]}></ha-icon>` : nothing)}${area.name}
    </button>`
  }
  const name = (floor: FloorRegistryEntry) => o.onFloor
    ? html`<button class="storey-name" aria-pressed=${!!o.floorPressed?.(floor.floor_id)} @click=${() => o.onFloor!(floor.floor_id)}>${floor.name}</button>`
    : html`<span class="storey-name">${floor.name}</span>`
  return html`<div class="house">
    ${inside.length ? html`<div class="roof" aria-hidden="true"></div>
      <div class="storeys">${inside.map(s => html`<div class="storey">${name(s.floor)}<div class="rooms">${s.areas.map(room)}</div></div>`)}</div>` : nothing}
    ${outside.length ? html`<div class="storey outside"><span class="storey-name">${o.outsideLabel}</span><div class="rooms">${outside.map(room)}</div></div>` : nothing}
  </div>`
}

export const houseStyles = css`
  .house { --wall: color-mix(in srgb, var(--primary-text-color, #e5e7eb) 32%, transparent); display: flex; flex-direction: column; }
  /* Gable roof over the storeys */
  .roof { height: 30px; margin: 0 -8px; background: var(--wall); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
  .storeys { border: 2px solid var(--wall); border-top: 0; }
  .storey { display: grid; grid-template-columns: 116px 1fr; }
  .storeys .storey + .storey { border-top: 2px solid var(--wall); }
  .storey-name {
    all: unset; box-sizing: border-box; padding: 10px 10px; font-size: 12px; font-weight: 600; line-height: 1.3;
    color: var(--secondary-text-color, #94a3b8); border-right: 1px dashed var(--ad-line); hyphens: auto; overflow-wrap: break-word;
  }
  button.storey-name { cursor: pointer; }
  button.storey-name:hover { color: var(--primary-text-color, inherit); }
  button.storey-name[aria-pressed=true] { color: var(--ad-accent); background: color-mix(in srgb, var(--ad-accent) 12%, transparent); }
  .rooms { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; min-width: 0; }
  /* Rooms are drawn as rooms: rectangles, not pills */
  .room {
    all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
    padding: 7px 10px; min-width: 76px; border-radius: 4px; font-size: 13px; line-height: 1.2;
    border: 1px solid var(--ad-line); background: var(--card-background-color, transparent);
  }
  .room ha-icon { --mdc-icon-size: 15px; }
  .room:hover { border-color: color-mix(in srgb, var(--primary-text-color, #e5e7eb) 45%, transparent); }
  .room:focus-visible, .storey-name:focus-visible { outline: 2px solid var(--ad-accent); outline-offset: 2px; }
  .room.hidden { border-style: dashed; background: transparent; color: var(--secondary-text-color, #94a3b8); text-decoration: line-through; }
  .room.outdoor { border-color: var(--success-color, #43a047); color: var(--success-color, #43a047); background: color-mix(in srgb, var(--success-color, #43a047) 10%, transparent); }
  .room.only, .room.picked { border-color: var(--ad-accent); color: var(--ad-accent); background: color-mix(in srgb, var(--ad-accent) 16%, transparent); font-weight: 600; }
  /* Outside: the ground line under the house */
  .outside { margin-top: 12px; border-top: 2px dashed var(--wall); }
  .outside .storey-name { border-right-style: none; }
  @media (max-width: 460px) {
    .storey { grid-template-columns: 1fr; }
    .storey-name { border-right: 0; border-bottom: 1px dashed var(--ad-line); padding: 6px 10px; }
    .outside .storey-name { border-bottom: 0; }
  }
`
