'use client'

import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  const features = [
    {
      title: 'Document Library',
      description: 'Upload and organize PDFs, presentations, and documents into focused study sessions.',
    },
    {
      title: 'AI Assistant',
      description: 'Ask questions about your materials and get instant answers with full context.',
    },
    {
      title: 'Interactive Learning',
      description: 'Navigate documents while getting real-time help. Study smarter, not harder.',
    },
    {
      title: 'Track Progress',
      description: 'Monitor your learning with insights on lessons completed and mastery levels.',
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex justify-between items-center h-14">
            <span className="text-lg font-semibold text-text-primary">Studyz</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/login')}
                className="btn-ghost"
              >
                Sign In
              </button>
              <button
                onClick={() => router.push('/register')}
                className="btn-primary"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20">
        <div className="max-w-2xl">
          <h1 className="text-5xl font-semibold tracking-tight text-text-primary mb-6">
            Study smarter with AI
          </h1>
          <p className="text-xl text-text-secondary mb-8 leading-relaxed">
            Upload your study materials, organize them into lessons, and get instant AI assistance as you learn.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/register')}
              className="btn-primary px-6 py-2.5"
            >
              Start Learning
            </button>
            <button
              onClick={() => router.push('/login')}
              className="btn-secondary px-6 py-2.5"
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-semibold text-text-primary mb-12">
            Everything you need to excel
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="p-6 rounded-lg border border-border hover:border-border-light transition-colors"
              >
                <h3 className="text-lg font-medium text-text-primary mb-2">
                  {feature.title}
                </h3>
                <p className="text-text-secondary">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold text-text-primary mb-4">
            Ready to transform your learning?
          </h2>
          <p className="text-text-secondary mb-8 max-w-lg mx-auto">
            Join students who are already studying smarter with AI assistance.
          </p>
          <button
            onClick={() => router.push('/register')}
            className="btn-primary px-6 py-2.5"
          >
            Get Started Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-text-secondary">Studyz</span>
            <span className="text-sm text-text-tertiary">
              © 2025 AI-powered learning
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
