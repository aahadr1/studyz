'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message || 'Registration failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Logo - top left */}
      <a 
        href="/" 
        className="absolute top-6 left-6 text-lg font-semibold text-text-primary hover:text-text-secondary transition-colors"
      >
        Studyz
      </a>

      {/* Register Card */}
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-text-primary mb-2">Create account</h1>
          <p className="text-text-secondary">Start your learning journey</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="input-label">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="input"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="input-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="input-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="input"
              placeholder="••••••••"
            />
            <p className="text-xs text-text-tertiary mt-1">Minimum 6 characters</p>
          </div>

          {error && (
            <div className="p-3 bg-error-muted border border-error/30 text-error text-sm rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <span className="text-text-tertiary text-sm">Already have an account? </span>
          <a href="/login" className="text-accent hover:underline text-sm">
            Sign in
          </a>
        </div>
      </div>
    </div>
  )
}
