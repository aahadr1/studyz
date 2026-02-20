'use client'

import { useRouter } from 'next/navigation'
import { FiArrowRight } from 'react-icons/fi'
import Logo from '@/components/Logo'

export default function Home() {
  const router = useRouter()

  const features = [
    { num: '01', title: 'Upload', desc: 'PDFs, documents, study materials' },
    { num: '02', title: 'Learn', desc: 'Interactive lessons' },
    { num: '03', title: 'Quiz', desc: 'Extract and practice MCQs' },
    { num: '04', title: 'Master', desc: 'Track progress, improve retention' },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex justify-between items-center h-14">
            <Logo size="md" href="/" />
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/login')}
                className="btn-ghost text-sm"
              >
                Sign In
              </button>
              <button
                onClick={() => router.push('/register')}
                className="btn-primary text-sm"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 pt-32 pb-24">
        <div className="max-w-3xl">
          <div className="inline-block px-4 py-2 bg-mode-study/10 border border-mode-study/30 rounded-full mb-6">
            <p className="text-xs text-mode-study uppercase tracking-wider font-medium">Smart Learning</p>
          </div>
          <h1 className="text-6xl font-bold tracking-tight text-text-primary mb-6 leading-tight">
            Study smarter,<br />not harder
          </h1>
          <p className="text-xl text-text-secondary mb-10 leading-relaxed">
            Upload your materials, learn interactively, and master any subject through structured practice.
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/register')}
              className="btn-primary px-8 py-3 text-base"
            >
              Start Learning
              <FiArrowRight className="w-5 h-5" strokeWidth={2} />
            </button>
            <button
              onClick={() => router.push('/login')}
              className="btn-secondary px-8 py-3 text-base"
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className="p-8 bg-elevated border border-border rounded-xl hover:bg-hover hover:border-border-light hover:shadow-md transition-all"
            >
              <span className="text-xs text-text-tertiary mono mb-4 block">{feature.num}</span>
              <h3 className="text-lg font-medium text-text-primary mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-text-secondary">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="bg-gradient-to-br from-mode-study/10 to-mode-test/10 border border-mode-study/30 rounded-2xl p-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <h2 className="text-3xl font-bold text-text-primary mb-3">
            Ready to transform your learning?
          </h2>
              <p className="text-lg text-text-secondary">
                Join students studying smarter.
          </p>
            </div>
          <button
            onClick={() => router.push('/register')}
              className="btn-primary px-8 py-3 text-base"
          >
            Get Started Free
              <FiArrowRight className="w-5 h-5" strokeWidth={2} />
          </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <Logo size="sm" />
            <span className="text-xs text-text-tertiary mono">
              © 2025
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
