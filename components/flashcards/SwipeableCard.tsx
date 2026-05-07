'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

interface Props {
  children: React.ReactNode
  /** Appelé quand l'utilisateur relâche au-delà du seuil. */
  onSwipe: (direction: SwipeDirection) => void
  /** Appelé sur un "tap" (mouvement négligeable). */
  onTap?: () => void
  /** Désactive les swipes. */
  disabled?: boolean
  /** Si vrai, les swipes verticaux sont actifs (haut=Difficile, bas=Bien). */
  enableVertical?: boolean
  /** Distance de translation (px) au-delà de laquelle le swipe est validé. */
  threshold?: number
  /** Informe le parent de l'état de drag pour afficher des overlays. */
  onDragChange?: (state: { x: number; y: number; intent: SwipeDirection | null }) => void
}

/**
 * Carte qui supporte les swipes 4 directions (style Tinder), avec animation
 * de sortie au commit et rebond élastique sur annulation. Les pointer events
 * gèrent indifféremment le tactile et la souris — parfait pour iPad.
 */
export default function SwipeableCard({
  children,
  onSwipe,
  onTap,
  disabled = false,
  enableVertical = true,
  threshold = 110,
  onDragChange,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const startRef = useRef<{ x: number; y: number; t: number; pointerId: number } | null>(null)
  const movedRef = useRef(false)
  const animatingOutRef = useRef(false)

  const [drag, setDrag] = useState<{ x: number; y: number; flying: SwipeDirection | null }>(
    { x: 0, y: 0, flying: null }
  )

  const computeIntent = useCallback((x: number, y: number): SwipeDirection | null => {
    const ax = Math.abs(x)
    const ay = Math.abs(y)
    if (ax < 24 && ay < 24) return null
    if (!enableVertical || ax > ay * 1.1) {
      return x > 0 ? 'right' : 'left'
    }
    return y > 0 ? 'down' : 'up'
  }, [enableVertical])

  useEffect(() => {
    if (onDragChange) {
      onDragChange({
        x: drag.x,
        y: drag.y,
        intent: animatingOutRef.current ? drag.flying : computeIntent(drag.x, drag.y),
      })
    }
  }, [drag.x, drag.y, drag.flying, computeIntent, onDragChange])

  const reset = useCallback(() => {
    setDrag({ x: 0, y: 0, flying: null })
    animatingOutRef.current = false
    startRef.current = null
    movedRef.current = false
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || animatingOutRef.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), pointerId: e.pointerId }
    movedRef.current = false
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* no-op */ }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current || disabled || animatingOutRef.current) return
    if (e.pointerId !== startRef.current.pointerId) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) movedRef.current = true
    setDrag({ x: dx, y: dy, flying: null })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!startRef.current) return
    if (e.pointerId !== startRef.current.pointerId) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* no-op */ }

    const dx = drag.x
    const dy = drag.y
    const moved = movedRef.current
    const elapsed = Date.now() - startRef.current.t

    if (!moved && elapsed < 350 && !disabled) {
      reset()
      onTap?.()
      return
    }

    const intent = computeIntent(dx, dy)
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    const horizontalOK = (intent === 'left' || intent === 'right') && ax >= threshold
    const verticalOK = enableVertical && (intent === 'up' || intent === 'down') && ay >= threshold

    if ((horizontalOK || verticalOK) && intent && !disabled) {
      animatingOutRef.current = true
      const flyDistance = 1200
      const target = (() => {
        switch (intent) {
          case 'left':  return { x: -flyDistance, y: dy * 0.4, flying: intent }
          case 'right': return { x:  flyDistance, y: dy * 0.4, flying: intent }
          case 'up':    return { x: dx * 0.4, y: -flyDistance, flying: intent }
          case 'down':  return { x: dx * 0.4, y:  flyDistance, flying: intent }
        }
      })()
      setDrag(target)
      window.setTimeout(() => {
        onSwipe(intent)
        reset()
      }, 240)
      return
    }

    setDrag({ x: 0, y: 0, flying: null })
    movedRef.current = false
    startRef.current = null
  }

  // Permet aux parents (boutons externes) de déclencher la même animation
  // que le swipe via une fonction posée sur la node DOM. Plus simple qu'un
  // forwardRef + useImperativeHandle pour le besoin présent.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    ;(el as any).__flyOut = (direction: SwipeDirection) => {
      if (animatingOutRef.current) return
      animatingOutRef.current = true
      const flyDistance = 1200
      const target = (() => {
        switch (direction) {
          case 'left':  return { x: -flyDistance, y: 0, flying: direction }
          case 'right': return { x:  flyDistance, y: 0, flying: direction }
          case 'up':    return { x: 0, y: -flyDistance, flying: direction }
          case 'down':  return { x: 0, y:  flyDistance, flying: direction }
        }
      })()
      setDrag(target)
      window.setTimeout(() => {
        onSwipe(direction)
        reset()
      }, 240)
    }
  }, [onSwipe, reset])

  const isDragging = !!startRef.current && !animatingOutRef.current
  const rot = Math.max(-18, Math.min(18, drag.x / 14))
  const transform = `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${rot}deg)`
  const transition = animatingOutRef.current
    ? 'transform 240ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 240ms ease-out'
    : isDragging
    ? 'none'
    : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'
  const opacity = animatingOutRef.current ? 0 : 1

  return (
    <div
      ref={ref}
      className="touch-none select-none will-change-transform"
      style={{ transform, transition, opacity }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </div>
  )
}

/** Helper impératif : déclenche une sortie animée d'une SwipeableCard. */
export function flyOut(node: HTMLElement | null, direction: SwipeDirection) {
  if (!node) return
  const fn = (node as any).__flyOut
  if (typeof fn === 'function') fn(direction)
}
