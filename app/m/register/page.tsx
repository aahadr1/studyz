'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff, FiArrowRight, FiZap, FiCheck } from 'react-icons/fi'

export default function MobileRegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Password strength indicators
  const passwordChecks = [
    { label: 'At least 6 characters', valid: password.length >= 6 },
    { label: 'Contains a number', valid: /\d/.test(password) },
    { label: 'Contains a letter', valid: /[a-zA-Z]/.test(password) },
  ]

  const isPasswordStrong = passwordChecks.every(check => check.valid)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      })

      if (error) throw error

      router.push('/m')
    } catch (err: any) {
      setError(err.message || 'Registration failed')
      setLoading(false)
    }
  }

  return (
    <div className="mobile-app bg-[var(--color-bg-primary)]">
      {/* Background gradient */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(168, 85, 247, 0.08) 0%, transparent 50%)'
        }}
      />
      
      {/* Content */}
      <div className="mobile-content-full flex flex-col px-6 pt-12 pb-8 overflow-auto">
        {/* Logo & Welcome */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-accent)] mb-5">
            <FiZap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-[var(--color-text-primary)] mb-2 tracking-tight">
            Create account
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            Start your learning journey
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="space-y-5 animate-slide-up">
          {/* Full Name Input */}
          <div className="input-group-mobile">
            <label className="input-label-mobile">Full name</label>
            <div className="relative">
              <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="input-mobile pl-12"
                placeholder="John Doe"
                autoComplete="name"
              />
            </div>
          </div>

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
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
              >
                {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
              </button>
            </div>
            
            {/* Password Strength Indicators */}
            {password.length > 0 && (
              <div className="mt-3 space-y-2">
                {passwordChecks.map((check, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-2 text-xs"
                  >
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      check.valid 
                        ? 'bg-[var(--color-success)] text-white' 
                        : 'bg-[var(--color-surface)] text-[var(--color-text-tertiary)]'
                    }`}>
                      <FiCheck className="w-2.5 h-2.5" />
                    </div>
                    <span className={check.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]'}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
            disabled={loading || !isPasswordStrong}
            className="btn-mobile btn-primary-mobile w-full"
          >
            {loading ? (
              <>
                <div className="spinner-mobile w-5 h-5" style={{ borderWidth: '2px' }} />
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>Create Account</span>
                <FiArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          {/* Terms */}
          <p className="text-xs text-center text-[var(--color-text-tertiary)] leading-relaxed">
            By creating an account, you agree to our{' '}
            <span className="text-[var(--color-accent)]">Terms of Service</span>
            {' '}and{' '}
            <span className="text-[var(--color-accent)]">Privacy Policy</span>
          </p>
        </form>

        {/* Spacer */}
        <div className="flex-1 min-h-[40px]" />

        {/* Login Link */}
        <div className="text-center pt-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <p className="text-[var(--color-text-secondary)]">
            Already have an account?{' '}
            <Link 
              href="/m/login" 
              className="text-[var(--color-accent)] font-semibold"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

