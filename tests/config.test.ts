import { describe, expect, it } from 'vitest'
import { cleanConfig } from '../src/config'

describe('cleanConfig', () => {
  it('drops defaults and empty values but keeps type and users', () => {
    expect(cleanConfig({
      type: 'custom:auto-dashboard', title: '', theme: 'auto', glass: false, nav_position: 'bottom',
      areas: [], floors: ['og'], hide_domains: [],
      users: { u1: { areas: [], read_only: false, control_critical: true }, default: { control_critical: false } },
    })).toEqual({
      type: 'custom:auto-dashboard', floors: ['og'],
      users: { u1: {}, default: { control_critical: false } },
    })
  })

  it('keeps non-default choices', () => {
    expect(cleanConfig({ type: 'custom:auto-dashboard', theme: 'dark', glass: true, nav_position: 'left' }))
      .toEqual({ type: 'custom:auto-dashboard', theme: 'dark', glass: true, nav_position: 'left' })
  })
})

describe('room settings', () => {
  it('drops empty lists, empty card slots and rooms left empty', () => {
    const out = cleanConfig({
      type: 'custom:auto-dashboard',
      rooms: {
        wohnzimmer: { hide_groups: [], order: ['light.a'], cards: { top: [], bottom: [{ type: 'markdown' }] } },
        kuche: { hide_groups: [], cards: {} },
      },
    })
    expect(out.rooms).toEqual({ wohnzimmer: { order: ['light.a'], cards: { bottom: [{ type: 'markdown' }] } } })
  })
})
