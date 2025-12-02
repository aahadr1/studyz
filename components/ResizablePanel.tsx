'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface ResizableHandleProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
  className?: string
}

export function ResizableHandle({ direction, onResize, className = '' }: ResizableHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startPosRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY
  }, [direction])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = currentPos - startPosRef.current
      startPosRef.current = currentPos
      onResize(delta)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, direction, onResize])

  const baseClasses = direction === 'horizontal'
    ? 'w-1 cursor-col-resize hover:w-1.5 group'
    : 'h-1 cursor-row-resize hover:h-1.5 group'

  const innerClasses = direction === 'horizontal'
    ? 'w-full h-full'
    : 'h-full w-full'

  return (
    <div
      className={`${baseClasses} flex-shrink-0 bg-border hover:bg-mode-study/50 transition-all relative ${isDragging ? 'bg-mode-study' : ''} ${className}`}
      onMouseDown={handleMouseDown}
    >
      <div className={`${innerClasses} flex items-center justify-center`}>
        {/* Visual indicator */}
        <div className={`
          ${direction === 'horizontal' ? 'w-0.5 h-8' : 'h-0.5 w-8'}
          bg-text-tertiary/30 group-hover:bg-mode-study rounded-full
          ${isDragging ? 'bg-mode-study' : ''}
        `} />
      </div>
    </div>
  )
}

interface ResizablePanelGroupProps {
  children: React.ReactNode
  direction: 'horizontal' | 'vertical'
  className?: string
}

export function ResizablePanelGroup({ children, direction, className = '' }: ResizablePanelGroupProps) {
  return (
    <div className={`flex ${direction === 'horizontal' ? 'flex-row' : 'flex-col'} ${className}`}>
      {children}
    </div>
  )
}

interface ResizablePanelProps {
  children: React.ReactNode
  defaultSize: number
  minSize?: number
  maxSize?: number
  className?: string
  style?: React.CSSProperties
}

export function ResizablePanel({
  children,
  defaultSize,
  minSize = 100,
  maxSize = 1000,
  className = '',
  style = {},
}: ResizablePanelProps) {
  return (
    <div className={className} style={{ ...style, flexShrink: 0 }}>
      {children}
    </div>
  )
}

// Hook for managing panel sizes with localStorage persistence
export function usePanelSizes(
  storageKey: string,
  defaults: { sidebar: number; bottomPanel: number; docScale: number }
) {
  const [sizes, setSizes] = useState(defaults)
  const [loaded, setLoaded] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        setSizes({ ...defaults, ...parsed })
      }
    } catch (e) {
      console.error('Error loading panel sizes:', e)
    }
    setLoaded(true)
  }, [storageKey])

  // Save to localStorage when sizes change
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(sizes))
      } catch (e) {
        console.error('Error saving panel sizes:', e)
      }
    }
  }, [sizes, storageKey, loaded])

  const updateSize = useCallback((key: keyof typeof defaults, value: number) => {
    setSizes(prev => ({ ...prev, [key]: value }))
  }, [])

  return { sizes, updateSize, loaded }
}

