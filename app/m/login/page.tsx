'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { FiArrowRight, FiEye, FiEyeOff } from 'react-icons/fi'

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
    <div className="mobile-app">
      <div className="mobile-content-full flex flex-col px-6 pt-16 pb-8">
        {/* Header */}
        <div className="mb-12">
          <Link href="/m/welcome" className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-tertiary)] mb-8 block">
            ← Back
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Sign In</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">Welcome back</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="flex-1 flex flex-col">
          <div className="space-y-5 flex-1">
            <div className="input-group-mobile">
              <label className="input-label-mobile">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-mobile"
                placeholder="you@example.com"
                autoComplete="email"
                autoCapitalize="none"
              />
            </div>

            <div className="input-group-mobile">
              <label className="input-label-mobile">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="input-mobile pr-12"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
                >
                  {showPassword ? <FiEyeOff className="w-4 h-4" strokeWidth={1.5} /> : <FiEye className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 border border-[var(--color-border)] bg-[var(--color-surface)]">
                <p className="text-sm text-[var(--color-text)]">{error}</p>
              </div>
            )}
          </div>

          <div className="pt-8">
            <button
              type="submit"
              disabled={loading}
              className="btn-mobile btn-primary-mobile w-full"
            >
              {loading ? (
                <div className="spinner-mobile w-5 h-5" />
              ) : (
                <>
                  Continue
                  <FiArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </>
              )}
            </button>

            <p className="text-center text-sm text-[var(--color-text-secondary)] mt-6">
              New here?{' '}
              <Link href="/m/register" className="text-[var(--color-text)] underline">
                Create account
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
