// Rows that scroll sideways (status chips, scenes, the tiles beside the weather, floor tabs) hide their scrollbar.
// A finger swipes them, but a mouse could not move them at all. This makes them work with a mouse too:
// - the wheel scrolls them sideways while they have more to show, and hands over to the page at either end,
// - they can be dragged, without the drag counting as a tap on what it started on,
// - a soft fade at the edge says there is more to that side.
// Usage: <div class="row" ${scrollRow()}>…</div>
import { noChange } from 'lit'
import { Directive, directive, PartType, type ElementPart, type PartInfo } from 'lit/directive.js'

/** Pixels the mouse moves before a press becomes a drag */
const DRAG_START = 6
const FADE = 28
/** A wheel gesture that began over the page keeps scrolling the page for this long */
const PAGE_GESTURE_MS = 350

let lastPageWheel = 0
let listening = false
function watchPageWheel() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('wheel', e => {
    if (!e.composedPath().some(n => attached.has(n as HTMLElement))) lastPageWheel = e.timeStamp
  }, { passive: true, capture: true })
}

const attached = new WeakSet<HTMLElement>()

function fade(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth
  const start = el.scrollLeft > 1
  const end = max - el.scrollLeft > 1
  if (!start && !end) {
    el.style.removeProperty('mask-image')
    el.style.removeProperty('-webkit-mask-image')
    return
  }
  const mask = `linear-gradient(to right, ${start ? `transparent 0, #000 ${FADE}px` : '#000 0'}, ${end ? `#000 calc(100% - ${FADE}px), transparent 100%` : '#000 100%'})`
  el.style.setProperty('mask-image', mask)
  el.style.setProperty('-webkit-mask-image', mask)
}

export function attachScrollRow(el: HTMLElement) {
  if (attached.has(el)) return
  attached.add(el)
  watchPageWheel()

  el.addEventListener('wheel', e => {
    const max = el.scrollWidth - el.clientWidth
    // Nothing hidden, a sideways gesture the browser handles itself, or zooming
    if (max <= 1 || e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
    // Still scrolling the page from above or below: don't catch it on the way past
    const passing = lastPageWheel && e.timeStamp - lastPageWheel < PAGE_GESTURE_MS
    if (passing) { lastPageWheel = e.timeStamp; return }
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1)
    const next = Math.min(max, Math.max(0, el.scrollLeft + delta))
    // At the end the page takes over
    if (Math.abs(next - el.scrollLeft) < 1) return
    e.preventDefault()
    el.scrollLeft = next
  }, { passive: false })

  let press: { x: number; left: number; id: number } | undefined
  let dragged = false
  const move = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return
    const dx = e.clientX - press.x
    if (!dragged && Math.abs(dx) < DRAG_START) return
    dragged = true
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'
    el.scrollLeft = press.left - dx
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    press = undefined
    el.style.removeProperty('cursor')
    el.style.removeProperty('user-select')
  }
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || el.scrollWidth - el.clientWidth <= 1) return
    press = { x: e.clientX, left: el.scrollLeft, id: e.pointerId }
    dragged = false
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  })
  // The click that ends a drag is not a tap on the chip it ended on
  el.addEventListener('click', e => {
    if (!dragged) return
    dragged = false
    e.preventDefault()
    e.stopPropagation()
  }, { capture: true })
  // Dragging a link or image would start the browser's own drag instead
  el.addEventListener('dragstart', e => { if (press) e.preventDefault() })

  el.addEventListener('scroll', () => fade(el), { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => fade(el))
    observer.observe(el)
    // The content grows without the row changing size (a chip appears), so watch the children too
    for (const child of el.children) observer.observe(child)
    new MutationObserver(() => {
      for (const child of el.children) observer.observe(child)
      fade(el)
    }).observe(el, { childList: true })
  }
  requestAnimationFrame(() => fade(el))
}

class ScrollRow extends Directive {
  constructor(info: PartInfo) {
    super(info)
    if (info.type !== PartType.ELEMENT) throw new Error('scrollRow() belongs on an element')
  }

  render() {
    return noChange
  }

  update(part: ElementPart) {
    attachScrollRow(part.element as HTMLElement)
    return noChange
  }
}

export const scrollRow = directive(ScrollRow)
