'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiBook, FiMail, FiLock, FiArrowRight } from 'react-icons/fi'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      setError(err.message || 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent-purple/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-blue/10 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Logo link - top left */}
      <a href="/" className="absolute top-8 left-8 flex items-center space-x-2 text-gray-300 hover:text-white transition-colors z-10">
        <div className="w-8 h-8 bg-gradient-to-br from-accent-purple to-accent-blue rounded-lg flex items-center justify-center">
          <FiBook className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold gradient-text">Studyz</span>
      </a>

      {/* Login Card */}
      <div className="glass-card p-8 md:p-10 w-full max-w-md relative z-10 animate-scale-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-accent-purple to-accent-blue rounded-2xl mx-auto mb-4 flex items-center justify-center glow-primary">
            <FiBook className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-gray-400">Sign in to continue your learning journey</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email field */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Email Address
            </label>
            <div className="relative">
              <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-field pl-12"
                placeholder="you@example.com"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Password
            </label>
            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input-field pl-12"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm animate-slide-down">
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-accent flex items-center justify-center space-x-2 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{loading ? 'Signing in...' : 'Sign In'}</span>
            {!loading && <FiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-dark-border"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-dark-elevated text-gray-500">New to Studyz?</span>
          </div>
        </div>

        {/* Sign up link */}
        <a href="/register" className="block text-center">
          <button className="w-full btn-secondary">
            Create an Account
          </button>
        </a>
      </div>
    </div>
  )
}
