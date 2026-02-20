'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  FiHome, 
  FiBook, 
  FiCheckSquare, 
  FiUser,
  FiChevronLeft,
  FiRefreshCw,
  FiWifi,
  FiWifiOff,
  FiZap,
  FiMic
} from 'react-icons/fi'
import { ToastProvider } from './MobileToast'
import { useNetworkStatus } from './useMobileUtils'

// ============================================
// Types
// ============================================
interface MobileLayoutProps {
  children: ReactNode
  hideNav?: boolean
  hideTabBar?: boolean
}

interface MobileHeaderProps {
  title?: string
  subtitle?: string
  backHref?: string
  onBack?: () => void
  rightAction?: ReactNode
  transparent?: boolean
  largeTitle?: boolean
}

// ============================================
// Network Status Banner
// ============================================
function NetworkStatusBanner() {
  const { isOnline } = useNetworkStatus()
  const [showBanner, setShowBanner] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true)
      setWasOffline(true)
    } else if (wasOffline) {
      // Show "back online" message briefly
      setShowBanner(true)
      const timer = setTimeout(() => {
        setShowBanner(false)
        setWasOffline(false)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [isOnline, wasOffline])

  if (!showBanner) return null

  return (
    <div 
      className={`fixed top-0 left-0 right-0 z-[600] px-4 py-2 text-center text-sm font-medium transition-all duration-300 safe-top ${
        isOnline 
          ? 'bg-[var(--color-success)] text-white' 
          : 'bg-[var(--color-error)] text-white'
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        {isOnline ? (
          <>
            <FiWifi className="w-4 h-4" />
            <span>Back online</span>
          </>
        ) : (
          <>
            <FiWifiOff className="w-4 h-4" />
            <span>No internet connection</span>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================
// Mobile Header Component
// ============================================
export function MobileHeader({ 
  title, 
  subtitle,
  backHref, 
  onBack, 
  rightAction,
  transparent = false,
  largeTitle = false
}: MobileHeaderProps) {
  const handleBack = () => {
    if (onBack) {
      onBack()
    } else if (backHref) {
      window.location.href = backHref
    } else {
      window.history.back()
    }
  }

  return (
    <header 
      className={`mobile-header ${transparent ? 'bg-transparent border-transparent backdrop-blur-none' : ''}`}
      style={transparent ? { background: 'transparent', borderColor: 'transparent' } : {}}
    >
      {/* Left Action */}
      <div className="w-12">
        {(backHref || onBack) && (
          <button 
            onClick={handleBack}
            className="mobile-header-action"
            aria-label="Go back"
          >
            <FiChevronLeft className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Title */}
      <div className="flex-1 text-center min-w-0">
        {!largeTitle && title && (
          <>
            <h1 className="mobile-header-title truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-[var(--color-text-secondary)] truncate -mt-0.5">
                {subtitle}
              </p>
            )}
          </>
        )}
      </div>

      {/* Right Action */}
      <div className="w-12 flex justify-end">
        {rightAction}
      </div>
    </header>
  )
}

// ============================================
// Mobile Tab Bar Component
// ============================================
export function MobileTabBar() {
  const pathname = usePathname()

  const tabs = [
    { 
      href: '/m', 
      label: 'Home', 
      icon: FiHome,
      isActive: pathname === '/m' || pathname === '/m/dashboard'
    },
    { 
      href: '/m/interactive-lessons', 
      label: 'Lessons', 
      icon: FiZap,
      isActive: pathname?.startsWith('/m/interactive-lessons')
    },
    { 
      href: '/m/intelligent-podcast', 
      label: 'Podcasts', 
      icon: FiMic,
      isActive: pathname?.startsWith('/m/intelligent-podcast')
    },
    { 
      href: '/m/mcq', 
      label: 'Quiz', 
      icon: FiCheckSquare,
      isActive: pathname?.startsWith('/m/mcq')
    },
  ]

  return (
    <nav className="mobile-tab-bar">
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`mobile-tab-item ${tab.isActive ? 'active' : ''}`}
          >
            <Icon className="mobile-tab-icon" />
            <span className="mobile-tab-label">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

// ============================================
// Mobile Layout Component
// ============================================
export default function MobileLayout({ 
  children, 
  hideNav = false,
  hideTabBar = false 
}: MobileLayoutProps) {
  return (
    <ToastProvider>
    <div className="mobile-app">
        <NetworkStatusBanner />
      {children}
      {!hideTabBar && <MobileTabBar />}
    </div>
    </ToastProvider>
  )
}

// ============================================
// Page Container Component
// ============================================
export function MobilePageContainer({ 
  children, 
  noPadding = false,
  className = ''
}: { 
  children: ReactNode
  noPadding?: boolean
  className?: string 
}) {
  return (
    <div className={`mobile-content ${noPadding ? '' : 'px-4'} ${className}`}>
      {children}
    </div>
  )
}

// ============================================
// Section Component
// ============================================
export function MobileSection({ 
  title, 
  subtitle,
  children,
  action,
  className = ''
}: { 
  title?: string
  subtitle?: string
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <section className={`py-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3 px-4">
          <div>
            {title && <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{title}</h2>}
            {subtitle && <p className="text-sm text-[var(--color-text-secondary)]">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// ============================================
// Floating Action Button
// ============================================
export function FloatingActionButton({ 
  onClick, 
  href,
  icon,
  label 
}: { 
  onClick?: () => void
  href?: string
  icon: ReactNode
  label?: string
}) {
  const buttonContent = (
    <>
      {icon}
      {label && <span className="sr-only">{label}</span>}
    </>
  )

  if (href) {
    return (
      <Link href={href} className="fab" aria-label={label}>
        {buttonContent}
      </Link>
    )
  }

  return (
    <button onClick={onClick} className="fab" aria-label={label}>
      {buttonContent}
    </button>
  )
}

// ============================================
// Bottom Sheet Component
// ============================================
export function BottomSheet({
  isOpen,
  onClose,
  title,
  children
}: {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <>
      {/* Overlay */}
      <div 
        className={`bottom-sheet-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div className={`bottom-sheet ${isOpen ? 'open' : ''}`}>
        <div className="bottom-sheet-handle" />
        
        {title && (
          <div className="bottom-sheet-header">
            <h2 className="bottom-sheet-title">{title}</h2>
          </div>
        )}
        
        <div className="bottom-sheet-content">
          {children}
        </div>
      </div>
    </>
  )
}

// ============================================
// Loading Overlay Component
// ============================================
export function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="loading-overlay">
      <div className="spinner-mobile" />
      {message && <p className="loading-text">{message}</p>}
    </div>
  )
}

// ============================================
// Empty State Component
// ============================================
export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state animate-fade-in">
      <div className="empty-state-icon">
        {icon}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-text">{description}</p>}
      {action}
    </div>
  )
}

// ============================================
// Pull to Refresh Indicator
// ============================================
export function PullToRefreshIndicator({ 
  progress, 
  isRefreshing 
}: { 
  progress: number
  isRefreshing: boolean 
}) {
  if (progress === 0 && !isRefreshing) return null

  return (
    <div 
      className="flex items-center justify-center py-4 transition-all"
      style={{ 
        opacity: Math.min(progress, 1),
        transform: `translateY(${Math.min(progress * 20, 20)}px)` 
      }}
    >
      <div 
        className={`w-8 h-8 rounded-full border-2 border-[var(--color-accent)] flex items-center justify-center ${
          isRefreshing ? 'animate-spin' : ''
        }`}
        style={{ 
          borderTopColor: 'transparent',
          transform: `rotate(${progress * 360}deg)` 
        }}
      >
        <FiRefreshCw className={`w-4 h-4 text-[var(--color-accent)] ${isRefreshing ? '' : 'hidden'}`} />
      </div>
    </div>
  )
}

// ============================================
// Skeleton Loader Component
// ============================================
export function Skeleton({ 
  className = '', 
  variant = 'text' 
}: { 
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' 
}) {
  const baseClasses = 'skeleton animate-pulse'
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`} />
  )
}

// ============================================
// Card Skeleton Loader
// ============================================
export function CardSkeleton() {
  return (
    <div className="mobile-card p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" className="w-11 h-11 flex-shrink-0" />
        <div className="flex-1">
          <Skeleton className="w-3/4 mb-2" />
          <Skeleton className="w-1/2" />
        </div>
      </div>
    </div>
  )
}

// ============================================
// List Skeleton Loader
// ============================================
export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3 px-4 py-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

// ============================================
// Pull to Refresh Hook (for future use)
// ============================================
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  // Implementation for pull-to-refresh gesture
  // This would be more complex in a real implementation
  return {
    isRefreshing: false,
    pullProgress: 0
  }
}
