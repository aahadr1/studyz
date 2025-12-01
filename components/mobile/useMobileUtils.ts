'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ============================================
// Haptic Feedback Utility
// ============================================
export function useHapticFeedback() {
  const triggerHaptic = useCallback((style: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' = 'light') => {
    // Use Vibration API if available
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const patterns: Record<typeof style, number | number[]> = {
        light: 10,
        medium: 20,
        heavy: 30,
        success: [10, 30, 10],
        error: [30, 50, 30],
        warning: [20, 40, 20],
      }
      navigator.vibrate(patterns[style])
    }
  }, [])

  return { triggerHaptic }
}

// ============================================
// Pull to Refresh Hook
// ============================================
interface PullToRefreshOptions {
  onRefresh: () => Promise<void>
  threshold?: number
  resistance?: number
}

export function usePullToRefresh({ onRefresh, threshold = 80, resistance = 2.5 }: PullToRefreshOptions) {
  const [isPulling, setIsPulling] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  
  const startY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const container = containerRef.current
    if (!container || container.scrollTop > 0 || isRefreshing) return
    
    startY.current = e.touches[0].pageY
    setIsPulling(true)
  }, [isRefreshing])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling || isRefreshing) return
    
    const currentY = e.touches[0].pageY
    const diff = currentY - startY.current
    
    if (diff > 0) {
      // Apply resistance
      const distance = Math.min(diff / resistance, 150)
      setPullDistance(distance)
      
      // Prevent default scrolling when pulling
      if (distance > 0) {
        e.preventDefault()
      }
    }
  }, [isPulling, isRefreshing, resistance])

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return
    
    setIsPulling(false)
    
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true)
      setPullDistance(threshold / 2) // Keep some visual feedback
      
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [isPulling, pullDistance, threshold, isRefreshing, onRefresh])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  const pullProgress = Math.min(pullDistance / threshold, 1)

  return {
    containerRef,
    isPulling,
    isRefreshing,
    pullDistance,
    pullProgress,
  }
}

// ============================================
// Swipe Actions Hook
// ============================================
interface SwipeAction {
  id: string
  color: string
  icon: React.ReactNode
  onAction: () => void
}

interface SwipeActionsOptions {
  leftActions?: SwipeAction[]
  rightActions?: SwipeAction[]
  threshold?: number
}

export function useSwipeActions({ leftActions = [], rightActions = [], threshold = 80 }: SwipeActionsOptions) {
  const [offsetX, setOffsetX] = useState(0)
  const [isOpen, setIsOpen] = useState<'left' | 'right' | null>(null)
  
  const startX = useRef(0)
  const startY = useRef(0)
  const isHorizontalSwipe = useRef<boolean | null>(null)
  const elementRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    isHorizontalSwipe.current = null
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const diffX = e.touches[0].clientX - startX.current
    const diffY = e.touches[0].clientY - startY.current

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        isHorizontalSwipe.current = Math.abs(diffX) > Math.abs(diffY)
      }
    }

    if (!isHorizontalSwipe.current) return

    // Prevent scrolling when swiping horizontally
    e.stopPropagation()

    // Clamp the offset
    const maxLeft = leftActions.length > 0 ? threshold * leftActions.length : 0
    const maxRight = rightActions.length > 0 ? threshold * rightActions.length : 0
    
    let newOffset = diffX
    if (isOpen === 'left') newOffset += maxLeft
    if (isOpen === 'right') newOffset -= maxRight
    
    newOffset = Math.max(-maxRight, Math.min(maxLeft, newOffset))
    setOffsetX(newOffset)
  }, [isOpen, leftActions.length, rightActions.length, threshold])

  const handleTouchEnd = useCallback(() => {
    if (!isHorizontalSwipe.current) return

    const maxLeft = threshold * leftActions.length
    const maxRight = threshold * rightActions.length

    // Determine final state
    if (offsetX > threshold / 2 && leftActions.length > 0) {
      setIsOpen('left')
      setOffsetX(maxLeft)
    } else if (offsetX < -threshold / 2 && rightActions.length > 0) {
      setIsOpen('right')
      setOffsetX(-maxRight)
    } else {
      setIsOpen(null)
      setOffsetX(0)
    }
  }, [offsetX, leftActions.length, rightActions.length, threshold])

  const close = useCallback(() => {
    setIsOpen(null)
    setOffsetX(0)
  }, [])

  return {
    elementRef,
    offsetX,
    isOpen,
    close,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  }
}

// ============================================
// Scroll Lock Hook
// ============================================
export function useScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (isLocked) {
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      document.body.style.overflowY = 'scroll'
    } else {
      const scrollY = document.body.style.top
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      document.body.style.overflowY = ''
      window.scrollTo(0, parseInt(scrollY || '0') * -1)
    }

    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      document.body.style.overflowY = ''
    }
  }, [isLocked])
}

// ============================================
// Keyboard Visibility Hook
// ============================================
export function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      // Check if viewport height is significantly smaller than window height
      // This indicates the keyboard is open on mobile
      const viewportHeight = window.visualViewport?.height || window.innerHeight
      const windowHeight = window.screen.height
      setIsKeyboardVisible(viewportHeight < windowHeight * 0.75)
    }

    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize)
      return () => window.visualViewport?.removeEventListener('resize', handleResize)
    }
  }, [])

  return isKeyboardVisible
}

// ============================================
// Network Status Hook
// ============================================
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true)
  const [connectionType, setConnectionType] = useState<string | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined') return

    setIsOnline(navigator.onLine)

    const connection = (navigator as any).connection || 
                       (navigator as any).mozConnection || 
                       (navigator as any).webkitConnection
    
    if (connection) {
      setConnectionType(connection.effectiveType || connection.type)
    }

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline, connectionType }
}

// ============================================
// Safe Area Insets Hook
// ============================================
export function useSafeAreaInsets() {
  const [insets, setInsets] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  })

  useEffect(() => {
    const computeInsets = () => {
      const style = getComputedStyle(document.documentElement)
      setInsets({
        top: parseInt(style.getPropertyValue('--safe-area-top') || '0'),
        bottom: parseInt(style.getPropertyValue('--safe-area-bottom') || '0'),
        left: parseInt(style.getPropertyValue('--safe-area-left') || '0'),
        right: parseInt(style.getPropertyValue('--safe-area-right') || '0'),
      })
    }

    computeInsets()
    window.addEventListener('resize', computeInsets)
    return () => window.removeEventListener('resize', computeInsets)
  }, [])

  return insets
}

// ============================================
// Orientation Hook
// ============================================
export function useOrientation() {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')

  useEffect(() => {
    const handleOrientationChange = () => {
      if (typeof window !== 'undefined') {
        setOrientation(
          window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
        )
      }
    }

    handleOrientationChange()
    window.addEventListener('resize', handleOrientationChange)
    window.addEventListener('orientationchange', handleOrientationChange)

    return () => {
      window.removeEventListener('resize', handleOrientationChange)
      window.removeEventListener('orientationchange', handleOrientationChange)
    }
  }, [])

  return orientation
}

