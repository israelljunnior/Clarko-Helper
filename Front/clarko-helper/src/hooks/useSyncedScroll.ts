import { useEffect } from 'react'

/** A scrolling pane and the selector for its paragraphs, which match the other pane's one to one. */
export interface ScrollPane {
  element: HTMLElement | null
  blocks: string
}

/** Where each paragraph sits inside its pane's scrollable content. */
function blockBoxes(pane: HTMLElement, selector: string) {
  const origin = pane.getBoundingClientRect().top - pane.scrollTop
  return Array.from(pane.querySelectorAll<HTMLElement>(selector), (block) => {
    const rect = block.getBoundingClientRect()
    return { top: rect.top - origin, height: rect.height }
  })
}

/**
 * Where `to` should scroll so it shows the same place in the document as `from`.
 *
 * Both panes are matched at an anchor line that slides down the view as the pane scrolls: its top edge
 * at the start of the document, its bottom edge at the end, in between in proportion. Matching only the
 * top edge would let the bottoms drift apart, because Clarko's pane wraps some paragraphs onto more
 * lines; near the end the last paragraph would then be cut off on one side. Falls back to the same
 * scroll percentage when the paragraphs don't line up (e.g. mid-render).
 */
function matchingScrollTop(from: HTMLElement, fromBlocks: string, to: HTMLElement, toBlocks: string): number {
  const toRange = to.scrollHeight - to.clientHeight
  const fromRange = from.scrollHeight - from.clientHeight

  // At either end, stay at that end: the panes can differ in height a little.
  if (from.scrollTop <= 0) return 0
  if (from.scrollTop >= fromRange - 1) return toRange

  const fraction = fromRange > 0 ? from.scrollTop / fromRange : 0
  const source = blockBoxes(from, fromBlocks)
  const target = blockBoxes(to, toBlocks)
  if (source.length === 0 || source.length !== target.length) return fraction * toRange

  // The anchor line in `from`, and which paragraph it falls in (or the gap after it).
  const anchor = from.scrollTop + fraction * from.clientHeight
  const index = Math.max(0, source.findLastIndex((box) => box.top <= anchor))
  const progress = source[index].height > 0 ? (anchor - source[index].top) / source[index].height : 0

  // The same point in `to`, placed at the same height within its view.
  const point = target[index].top + Math.min(Math.max(progress, 0), 1) * target[index].height
  let scrollTop = point - fraction * to.clientHeight

  // If `from` shows the start or the end of the document, `to` must too, with the same space around it:
  // typing at the end scrolls the editor just far enough for the caret, not to its very bottom.
  const [firstFrom, lastFrom] = [source[0], source[source.length - 1]]
  const [firstTo, lastTo] = [target[0], target[target.length - 1]]
  // A couple of pixels of slack: layout uses fractional pixels, and a paragraph ending exactly at the
  // edge can measure a hair past it.
  const slack = 2
  const fromBottom = from.scrollTop + from.clientHeight
  if (firstFrom.top >= from.scrollTop - slack) {
    const gapAbove = Math.max(0, firstFrom.top - from.scrollTop)
    scrollTop = Math.min(scrollTop, firstTo.top - gapAbove)
  }
  // Applied last so the end wins when `from` shows both ends but `to` is too tall for that: the end is
  // where the author is usually typing, while the start is just the title edging out of view.
  if (lastFrom.top + lastFrom.height <= fromBottom + slack) {
    const gapBelow = Math.max(0, fromBottom - (lastFrom.top + lastFrom.height))
    scrollTop = Math.max(scrollTop, lastTo.top + lastTo.height + gapBelow - to.clientHeight)
  }

  return Math.min(Math.max(scrollTop, 0), toRange)
}

/**
 * Keeps two scrolling panes in step: scrolling one moves the other to the same paragraph. Paragraph-
 * anchored rather than pixel-for-pixel, because the panes' content heights differ slightly (Clarko's
 * pane has suggestion widgets, headers and fonts can render differently).
 */
export function useSyncedScroll(first: ScrollPane, second: ScrollPane) {
  const { element: firstElement, blocks: firstBlocks } = first
  const { element: secondElement, blocks: secondBlocks } = second

  useEffect(() => {
    if (!firstElement || !secondElement) return

    const panes = [
      { element: firstElement, blocks: firstBlocks },
      { element: secondElement, blocks: secondBlocks },
    ]
    const other = (pane: (typeof panes)[number]) => (pane === panes[0] ? panes[1] : panes[0])

    // The pane the author is working in: the last one they wheeled, clicked, touched or typed in. Only
    // its scrolling moves the other pane. Scroll events on the other pane are our own updates echoing
    // back, or the browser clamping it as content changes, and must never drag the author's pane
    // (and the caret) along. The editor starts as the active pane.
    let active = panes[0]

    const align = (from: (typeof panes)[number]) => {
      const to = other(from)
      to.element.scrollTop = Math.round(matchingScrollTop(from.element, from.blocks, to.element, to.blocks))
    }

    const onScroll = (pane: (typeof panes)[number]) => () => {
      if (pane === active) align(pane)
    }

    // Content that changes height without a scroll (a new paragraph that Clarko's pane renders a moment
    // after the editor scrolled, a suggestion appearing, text re-wrapping on resize) would leave the
    // panes out of step, so re-align to the active pane once per frame after any such change.
    let frame = 0
    const realign = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => align(active))
    }
    const mutations = new MutationObserver(realign)
    const resizes = new ResizeObserver(realign)

    const intents = ['wheel', 'pointerdown', 'touchstart', 'keydown', 'focusin'] as const
    const cleanups = panes.map((pane) => {
      const onScrollPane = onScroll(pane)
      const onIntent = () => {
        active = pane
      }
      pane.element.addEventListener('scroll', onScrollPane, { passive: true })
      intents.forEach((type) => pane.element.addEventListener(type, onIntent, { passive: true }))
      mutations.observe(pane.element, { childList: true, subtree: true, characterData: true })
      resizes.observe(pane.element)
      return () => {
        pane.element.removeEventListener('scroll', onScrollPane)
        intents.forEach((type) => pane.element.removeEventListener(type, onIntent))
      }
    })

    return () => {
      cleanups.forEach((cleanup) => cleanup())
      mutations.disconnect()
      resizes.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [firstElement, firstBlocks, secondElement, secondBlocks])
}
