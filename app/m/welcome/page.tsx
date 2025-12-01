'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { 
  FiZap, 
  FiBook, 
  FiCheckSquare, 
  FiMessageCircle,
  FiArrowRight,
  FiShield,
  FiCloud
} from 'react-icons/fi'

const slides = [
  {
    icon: FiBook,
    title: 'Interactive Lessons',
    description: 'Upload any PDF and study with AI-powered assistance that understands your content.',
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-500',
    bgGlow: 'rgba(0, 212, 255, 0.15)'
  },
  {
    icon: FiCheckSquare,
    title: 'Smart Quizzes',
    description: 'Extract MCQs from your materials automatically and test your knowledge.',
    color: 'purple',
    gradient: 'from-purple-500 to-pink-500',
    bgGlow: 'rgba(168, 85, 247, 0.15)'
  },
  {
    icon: FiMessageCircle,
    title: 'AI Assistant',
    description: 'Ask questions about your content and get instant, contextual answers.',
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-500',
    bgGlow: 'rgba(16, 185, 129, 0.15)'
  }
]

const features = [
  { icon: FiShield, text: 'Secure & Private' },
  { icon: FiCloud, text: 'Cloud Sync' },
  { icon: FiZap, text: 'AI Powered' },
]

export default function MobileWelcomePage() {
  const router = useRouter()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const touchStartX = useRef(0)
  const autoSlideTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Check if already logged in
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.replace('/m')
      } else {
        setCheckingAuth(false)
      }
    }
    checkAuth()
  }, [router])

  // Auto-advance slides
  useEffect(() => {
    autoSlideTimer.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length)
    }, 4000)
    return () => {
      if (autoSlideTimer.current) clearInterval(autoSlideTimer.current)
    }
  }, [])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    // Pause auto-advance while touching
    if (autoSlideTimer.current) clearInterval(autoSlideTimer.current)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentSlide < slides.length - 1) {
        setCurrentSlide(prev => prev + 1)
      } else if (diff < 0 && currentSlide > 0) {
        setCurrentSlide(prev => prev - 1)
      }
    }
    // Resume auto-advance
    autoSlideTimer.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length)
    }, 4000)
  }

  if (checkingAuth) {
    return (
      <div className="mobile-app flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-secondary)] flex items-center justify-center animate-pulse">
            <FiZap className="w-8 h-8 text-white" />
          </div>
          <div className="spinner-mobile" />
        </div>
      </div>
    )
  }

  const CurrentIcon = slides[currentSlide].icon

  return (
    <div className="mobile-app bg-[var(--color-bg-primary)] overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Main glow */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-[120px] transition-all duration-1000"
          style={{ 
            top: '-200px',
            background: slides[currentSlide].bgGlow 
          }}
        />
        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      {/* Content */}
      <div className="mobile-content-full flex flex-col px-6 pt-safe-top relative">
        {/* Logo */}
        <div className="flex items-center gap-2.5 pt-6 mb-8">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-secondary)] flex items-center justify-center shadow-lg shadow-[var(--color-accent)]/25">
            <FiZap className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">Studyz</span>
        </div>

        {/* Slides */}
        <div 
          className="flex-1 flex flex-col items-center justify-center py-8"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Icon */}
          <div 
            className={`w-32 h-32 rounded-3xl flex items-center justify-center mb-8 bg-gradient-to-br ${slides[currentSlide].gradient} shadow-2xl animate-scale-in`}
            key={currentSlide}
          >
            <CurrentIcon className="w-16 h-16 text-white" />
          </div>

          {/* Title */}
          <h1 
            className="text-3xl font-extrabold text-[var(--color-text-primary)] text-center mb-4 tracking-tight animate-slide-up"
            key={`title-${currentSlide}`}
          >
            {slides[currentSlide].title}
          </h1>

          {/* Description */}
          <p 
            className="text-center text-[var(--color-text-secondary)] text-lg leading-relaxed max-w-[280px] animate-slide-up"
            key={`desc-${currentSlide}`}
            style={{ animationDelay: '50ms' }}
          >
            {slides[currentSlide].description}
          </p>
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`rounded-full transition-all duration-300 ${
                index === currentSlide 
                  ? 'w-8 h-2 bg-[var(--color-accent)]' 
                  : 'w-2 h-2 bg-[var(--color-border)]'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        {/* Features Row */}
        <div className="flex items-center justify-center gap-6 mb-6">
          {features.map((feature, i) => {
            const Icon = feature.icon
            return (
              <div key={i} className="flex items-center gap-1.5 text-[var(--color-text-tertiary)]">
                <Icon className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{feature.text}</span>
              </div>
            )
          })}
        </div>

        {/* CTA Buttons */}
        <div className="space-y-3 pb-8 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <Link 
            href="/m/register" 
            className="btn-mobile btn-primary-mobile w-full"
          >
            Get Started Free
            <FiArrowRight className="w-5 h-5" />
          </Link>
          
          <Link 
            href="/m/login" 
            className="btn-mobile btn-secondary-mobile w-full"
          >
            I already have an account
          </Link>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-[var(--color-text-tertiary)] pb-6">
          By continuing, you agree to our Terms of Service
        </p>
      </div>
    </div>
  )
}
