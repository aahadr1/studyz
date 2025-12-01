'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FiArrowRight, FiEye, FiEyeOff, FiCheck } from 'react-icons/fi'
import Logo from '@/components/Logo'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordChecks = [
    { label: '6+ chars', valid: password.length >= 6 },
    { label: 'Number', valid: /\d/.test(password) },
    { label: 'Letter', valid: /[a-zA-Z]/.test(password) },
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

      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message || 'Registration failed')
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
            Start learning<br />smarter today
          </h1>
          <p className="text-text-secondary text-lg">
            Create your account and unlock AI-powered study tools.
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
            <h2 className="text-2xl font-semibold text-text-primary mb-2">Create Account</h2>
            <p className="text-sm text-text-secondary">Fill in your details to get started</p>
        </div>

          <form onSubmit={handleRegister} className="space-y-6">
          <div>
            <label className="input-label">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="input"
              placeholder="John Doe"
                autoComplete="name"
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
                  autoComplete="new-password"
            />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                </button>
              </div>
              
              {password.length > 0 && (
                <div className="flex gap-4 mt-3">
                  {passwordChecks.map((check, index) => (
                    <div 
                      key={index}
                      className={`flex items-center gap-1.5 text-xs uppercase tracking-wider ${
                        check.valid ? 'text-success' : 'text-text-tertiary'
                      }`}
                    >
                      <div className={`w-3 h-3 border flex items-center justify-center ${
                        check.valid ? 'border-success bg-success' : 'border-border'
                      }`}>
                        {check.valid && <FiCheck className="w-2 h-2 text-background" strokeWidth={3} />}
                      </div>
                      {check.label}
                    </div>
                  ))}
                </div>
              )}
          </div>

          {error && (
              <div className="p-4 border border-error/30 bg-error-muted text-error text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
              disabled={loading || !isPasswordStrong}
              className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
              {loading ? (
                <div className="spinner spinner-sm" />
              ) : (
                <>
                  Create Account
                  <FiArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </>
              )}
          </button>
        </form>

          <p className="mt-6 text-center text-xs text-text-tertiary uppercase tracking-wider">
            By creating an account you agree to our Terms
          </p>

          <p className="mt-6 text-center text-sm text-text-secondary">
            Already have an account?{' '}
            <a href="/login" className="text-text-primary underline underline-offset-2">
            Sign in
          </a>
          </p>
        </div>
      </div>
    </div>
  )
}
