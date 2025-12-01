'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { FiCheck, FiX, FiAlertCircle, FiInfo } from 'react-icons/fi'

// ============================================
// Toast Types
// ============================================
type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  showToast: (type: ToastType, message: string, duration?: number) => void
  hideToast: (id: string) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
}

// ============================================
// Context
// ============================================
const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

// ============================================
// Provider
// ============================================
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((type: ToastType, message: string, duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    setToasts(prev => [...prev, { id, type, message, duration }])

    if (duration > 0) {
      setTimeout(() => {
        hideToast(id)
      }, duration)
    }
  }, [])

  const hideToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const success = useCallback((message: string, duration?: number) => {
    showToast('success', message, duration)
  }, [showToast])

  const error = useCallback((message: string, duration?: number) => {
    showToast('error', message, duration)
  }, [showToast])

  const warning = useCallback((message: string, duration?: number) => {
    showToast('warning', message, duration)
  }, [showToast])

  const info = useCallback((message: string, duration?: number) => {
    showToast('info', message, duration)
  }, [showToast])

  return (
    <ToastContext.Provider value={{ toasts, showToast, hideToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onHide={hideToast} />
    </ToastContext.Provider>
  )
}

// ============================================
// Toast Container
// ============================================
function ToastContainer({ toasts, onHide }: { toasts: Toast[], onHide: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[500] pointer-events-none p-4 safe-top">
      <div className="flex flex-col gap-2 items-center">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onHide={() => onHide(toast.id)} />
        ))}
      </div>
    </div>
  )
}

// ============================================
// Toast Item
// ============================================
function ToastItem({ toast, onHide }: { toast: Toast, onHide: () => void }) {
  const icons = {
    success: <FiCheck className="w-5 h-5" />,
    error: <FiX className="w-5 h-5" />,
    warning: <FiAlertCircle className="w-5 h-5" />,
    info: <FiInfo className="w-5 h-5" />,
  }

  const colors = {
    success: 'bg-[var(--color-success)] text-white',
    error: 'bg-[var(--color-error)] text-white',
    warning: 'bg-[var(--color-warning)] text-[var(--color-bg-primary)]',
    info: 'bg-[var(--color-accent)] text-[var(--color-bg-primary)]',
  }

  return (
    <div 
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg min-w-[280px] max-w-[calc(100vw-32px)] ${colors[toast.type]} animate-slide-down`}
      onClick={onHide}
      role="alert"
    >
      <div className="flex-shrink-0">
        {icons[toast.type]}
      </div>
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
    </div>
  )
}

// ============================================
// Export convenience function for standalone usage
// ============================================
let toastFunctions: ToastContextType | null = null

export function setToastFunctions(functions: ToastContextType) {
  toastFunctions = functions
}

export const toast = {
  success: (message: string, duration?: number) => toastFunctions?.success(message, duration),
  error: (message: string, duration?: number) => toastFunctions?.error(message, duration),
  warning: (message: string, duration?: number) => toastFunctions?.warning(message, duration),
  info: (message: string, duration?: number) => toastFunctions?.info(message, duration),
}

