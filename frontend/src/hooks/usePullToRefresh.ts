import { useCallback, useEffect, useRef, useState } from 'react'

type Options = {
  onRefresh: () => void | Promise<void>
  /** Distance (px) before refresh triggers */
  threshold?: number
  disabled?: boolean
}

function getScrollTop(target: HTMLElement | Window): number {
  if (target instanceof Window) return window.scrollY || document.documentElement.scrollTop
  return target.scrollTop
}

function findScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let node: HTMLElement | null = el
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node)
    const oy = style.overflowY
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight + 1) {
      return node
    }
    node = node.parentElement
  }
  return window
}

export function usePullToRefresh({ onRefresh, threshold = 72, disabled = false }: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const startY = useRef(0)
  const pulling = useRef(false)
  const distanceRef = useRef(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const setDistance = useCallback((value: number) => {
    distanceRef.current = value
    setPullDistance(value)
  }, [])

  const runRefresh = useCallback(async () => {
    setRefreshing(true)
    setDistance(threshold)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
      setDistance(0)
    }
  }, [onRefresh, setDistance, threshold])

  useEffect(() => {
    if (disabled) return
    const el = containerRef.current
    if (!el) return
    const scroller = findScrollParent(el)

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return
      if (getScrollTop(scroller) > 2) return
      startY.current = e.touches[0]?.clientY ?? 0
      pulling.current = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return
      if (getScrollTop(scroller) > 2) {
        pulling.current = false
        setDistance(0)
        return
      }
      const y = e.touches[0]?.clientY ?? 0
      const delta = y - startY.current
      if (delta <= 0) {
        setDistance(0)
        return
      }
      const dist = Math.min(delta * 0.45, threshold * 1.45)
      setDistance(dist)
      if (dist > 8) e.preventDefault()
    }

    const onTouchEnd = () => {
      if (!pulling.current) return
      pulling.current = false
      if (distanceRef.current >= threshold && !refreshing) {
        void runRefresh()
      } else {
        setDistance(0)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [disabled, refreshing, runRefresh, setDistance, threshold])

  return { containerRef, pullDistance, refreshing, threshold }
}
