'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight, FiZap } from 'react-icons/fi'

export default function MobileLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      router.push('/m')
    } catch (err: any) {
      setError(err.message || 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="mobile-app bg-[var(--color-bg-primary)]">
      {/* Background gradient */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(0, 212, 255, 0.08) 0%, transparent 50%)'
        }}
      />
      
      {/* Content */}
      <div className="mobile-content-full flex flex-col px-6 pt-16 pb-8">
        {/* Logo & Welcome */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-secondary)] mb-5">
            <FiZap className="w-8 h-8 text-[var(--color-bg-primary)]" />
          </div>
          <h1 className="text-3xl font-extrabold text-[var(--color-text-primary)] mb-2 tracking-tight">
            Welcome back
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            Sign in to continue learning
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5 animate-slide-up">
          {/* Email Input */}
          <div className="input-group-mobile">
            <label className="input-label-mobile">Email address</label>
            <div className="relative">
              <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-tertiary)]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-mobile pl-12"
                placeholder="you@example.com"
                autoComplete="email"
                autoCapitalize="none"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="input-group-mobile">
            <label className="input-label-mobile">Password</label>
            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-tertiary)]" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input-mobile pl-12 pr-12"
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
              >
                {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-xl bg-[var(--color-error-soft)] border border-[var(--color-error)]/20 animate-slide-down">
              <p className="text-sm text-[var(--color-error)] font-medium">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn-mobile btn-primary-mobile w-full"
          >
            {loading ? (
              <>
                <div className="spinner-mobile w-5 h-5" style={{ borderWidth: '2px' }} />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <FiArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Register Link */}
        <div className="text-center pt-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <p className="text-[var(--color-text-secondary)]">
            New to Studyz?{' '}
            <Link 
              href="/m/register" 
              className="text-[var(--color-accent)] font-semibold"
            >
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

