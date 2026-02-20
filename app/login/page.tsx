'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowRight, FiEye, FiEyeOff } from 'react-icons/fi'
import Logo from '@/components/Logo'

export default function LoginPage() {
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

      window.location.href = '/dashboard'
    } catch (err: any) {
      setError('Invalid email or password.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 border-r border-border flex-col justify-between p-12">
        <Logo size="lg" href="/" />
        <div>
          <h1 className="text-4xl font-semibold text-text-primary mb-4 tracking-tight">
            Welcome back
          </h1>
          <p className="text-text-secondary text-lg">
            Continue your learning journey.
          </p>
        </div>
        <p className="text-xs text-text-tertiary mono">© 2025</p>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-12">
            <Logo size="lg" href="/" />
          </div>

          <div className="mb-10">
            <h2 className="text-2xl font-semibold text-text-primary mb-2">Sign In</h2>
            <p className="text-sm text-text-secondary">Enter your credentials to continue</p>
        </div>

          <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="input-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input"
              placeholder="you@example.com"
                autoComplete="email"
            />
          </div>

          <div>
            <label className="input-label">Password</label>
              <div className="relative">
            <input
                  type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
                  className="input pr-12"
              placeholder="••••••••"
                  autoComplete="current-password"
            />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                </button>
              </div>
          </div>

          {error && (
              <div className="p-4 border border-error/30 bg-error-muted text-error text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
              className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
              {loading ? (
                <div className="spinner spinner-sm" />
              ) : (
                <>
                  Continue
                  <FiArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </>
              )}
          </button>
        </form>

          <p className="mt-8 text-center text-sm text-text-secondary">
            New to Studyz?{' '}
            <a href="/register" className="text-text-primary underline underline-offset-2">
            Create an account
          </a>
          </p>
        </div>
      </div>
    </div>
  )
}
