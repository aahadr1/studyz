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
  FiChevronRight,
  FiChevronLeft
} from 'react-icons/fi'

const slides = [
  {
    icon: FiBook,
    title: 'Interactive Lessons',
    description: 'Upload any PDF and study with AI-powered assistance that understands your content.',
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-500'
  },
  {
    icon: FiCheckSquare,
    title: 'Smart Quizzes',
    description: 'Extract MCQs from your materials automatically and test your knowledge.',
    color: 'purple',
    gradient: 'from-purple-500 to-pink-500'
  },
  {
    icon: FiMessageCircle,
    title: 'AI Assistant',
    description: 'Ask questions about your content and get instant, contextual answers.',
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-500'
  }
]

export default function MobileWelcomePage() {
  const router = useRouter()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const touchStartX = useRef(0)

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
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
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
  }

  if (checkingAuth) {
    return (
      <div className="mobile-app flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="spinner-mobile" />
      </div>
    )
  }

  const CurrentIcon = slides[currentSlide].icon

  return (
    <div className="mobile-app bg-[var(--color-bg-primary)]">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className={`absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 transition-all duration-1000 bg-gradient-to-br ${slides[currentSlide].gradient}`}
          style={{ top: '-200px' }}
        />
      </div>

      {/* Content */}
      <div className="mobile-content-full flex flex-col px-6 pt-12 pb-8 relative">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-12">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-secondary)] flex items-center justify-center">
            <FiZap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-[var(--color-text-primary)]">Studyz</span>
        </div>

        {/* Slides */}
        <div 
          className="flex-1 flex flex-col items-center justify-center"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Icon */}
          <div 
            className={`w-28 h-28 rounded-3xl flex items-center justify-center mb-8 bg-gradient-to-br ${slides[currentSlide].gradient} animate-scale-in`}
            key={currentSlide}
          >
            <CurrentIcon className="w-14 h-14 text-white" />
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
            className="text-center text-[var(--color-text-secondary)] text-lg leading-relaxed max-w-xs animate-slide-up"
            key={`desc-${currentSlide}`}
            style={{ animationDelay: '50ms' }}
          >
            {slides[currentSlide].description}
          </p>
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentSlide 
                  ? 'w-8 bg-[var(--color-accent)]' 
                  : 'w-2 bg-[var(--color-border)]'
              }`}
            />
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="space-y-3 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <Link 
            href="/m/register" 
            className="btn-mobile btn-primary-mobile w-full"
          >
            Get Started
            <FiArrowRight className="w-5 h-5" />
          </Link>
          
          <Link 
            href="/m/login" 
            className="btn-mobile btn-secondary-mobile w-full"
          >
            I already have an account
          </Link>
        </div>

        {/* Skip to app hint */}
        <p className="text-center text-xs text-[var(--color-text-tertiary)] mt-6">
          Swipe to explore features
        </p>
      </div>
    </div>
  )
}

