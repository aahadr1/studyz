'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { FiArrowRight, FiEye, FiEyeOff, FiCheck } from 'react-icons/fi'

export default function MobileRegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordChecks = [
    { label: '6+ characters', valid: password.length >= 6 },
    { label: 'Has number', valid: /\d/.test(password) },
    { label: 'Has letter', valid: /[a-zA-Z]/.test(password) },
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
    <div className="mobile-app">
      <div className="mobile-content-full flex flex-col px-6 pt-12 pb-8 overflow-auto">
        {/* Header */}
        <div className="mb-10">
          <Link href="/m/welcome" className="flex items-center gap-3 mb-8">
            <Image src="/favicon.png" alt="Studyz" width={32} height={32} priority />
            <span className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-tertiary)]">← Back</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Create Account</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">Start your learning journey</p>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="flex-1 flex flex-col">
          <div className="space-y-5 flex-1">
            <div className="input-group-mobile">
              <label className="input-label-mobile">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="input-mobile"
                placeholder="John Doe"
                autoComplete="name"
              />
            </div>

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
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
                >
                  {showPassword ? <FiEyeOff className="w-4 h-4" strokeWidth={1.5} /> : <FiEye className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              </div>
              
              {password.length > 0 && (
                <div className="flex gap-4 mt-3">
                  {passwordChecks.map((check, index) => (
                    <div 
                      key={index}
                      className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider ${
                        check.valid ? 'text-[var(--color-text)]' : 'text-[var(--color-text-tertiary)]'
                      }`}
                    >
                      <div className={`w-3 h-3 border flex items-center justify-center ${
                        check.valid ? 'border-[var(--color-text)] bg-[var(--color-text)]' : 'border-[var(--color-border)]'
                      }`}>
                        {check.valid && <FiCheck className="w-2 h-2 text-[var(--color-bg)]" strokeWidth={2} />}
                      </div>
                      {check.label}
                    </div>
                  ))}
                </div>
              )}
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
              disabled={loading || !isPasswordStrong}
              className="btn-mobile btn-primary-mobile w-full"
            >
              {loading ? (
                <div className="spinner-mobile w-5 h-5" />
              ) : (
                <>
                  Create Account
                  <FiArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </>
              )}
            </button>

            <p className="text-[9px] text-center text-[var(--color-text-tertiary)] mt-6 uppercase tracking-wider leading-relaxed">
              By creating an account you agree to our Terms
            </p>

            <p className="text-center text-sm text-[var(--color-text-secondary)] mt-4">
              Already have an account?{' '}
              <Link href="/m/login" className="text-[var(--color-text)] underline">
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
