'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { FiArrowRight } from 'react-icons/fi'

const features = [
  { title: 'Study', desc: 'Upload PDFs and learn with AI' },
  { title: 'Quiz', desc: 'Extract and practice MCQs' },
  { title: 'Chat', desc: 'Ask questions, get answers' },
]

export default function MobileWelcomePage() {
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
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

  if (checkingAuth) {
    return (
      <div className="mobile-app flex items-center justify-center">
        <div className="spinner-mobile" />
      </div>
    )
  }

  return (
    <div className="mobile-app">
      <div className="mobile-content-full flex flex-col">
        {/* Top Section */}
        <div className="flex-1 flex flex-col justify-center px-6 py-12">
        {/* Logo */}
          <div className="mb-12">
            <Image 
              src="/favicon.png" 
              alt="Studyz" 
              width={56} 
              height={56}
              className="mb-6"
              priority
            />
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Studyz</h1>
            <p className="text-[var(--color-text-secondary)]">Learn smarter with AI</p>
        </div>

          {/* Features */}
          <div className="space-y-4">
            {features.map((feature, i) => (
              <div 
                key={i}
                className="flex items-start gap-4 py-3"
              >
                <span className="text-xs font-medium mono text-[var(--color-text-tertiary)] w-6">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-medium text-sm">{feature.title}</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="px-6 pb-8 pt-4 border-t border-[var(--color-border)]">
          <Link 
            href="/m/register" 
            className="btn-mobile btn-primary-mobile w-full mb-3"
          >
            Get Started
            <FiArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
          
          <Link 
            href="/m/login" 
            className="btn-mobile btn-secondary-mobile w-full"
          >
            Sign In
          </Link>
          
          <p className="text-[9px] text-[var(--color-text-tertiary)] text-center mt-6 uppercase tracking-widest">
            By continuing you agree to our terms
          </p>
        </div>
      </div>
    </div>
  )
}
