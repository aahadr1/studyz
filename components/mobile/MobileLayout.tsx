'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  FiHome, 
  FiBook, 
  FiCheckSquare, 
  FiUser,
  FiChevronLeft,
  FiMoreHorizontal
} from 'react-icons/fi'

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
      href: '/m/lessons', 
      label: 'Lessons', 
      icon: FiBook,
      isActive: pathname?.startsWith('/m/lessons')
    },
    { 
      href: '/m/mcq', 
      label: 'Quiz', 
      icon: FiCheckSquare,
      isActive: pathname?.startsWith('/m/mcq')
    },
    { 
      href: '/m/profile', 
      label: 'Profile', 
      icon: FiUser,
      isActive: pathname?.startsWith('/m/profile')
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
    <div className="mobile-app">
      {children}
      {!hideTabBar && <MobileTabBar />}
    </div>
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

