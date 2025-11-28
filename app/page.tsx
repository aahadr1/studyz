'use client'

import { FiBook, FiZap, FiMessageSquare, FiTrendingUp, FiArrowRight, FiStar } from 'react-icons/fi'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  const features = [
    {
      icon: FiBook,
      title: 'Smart Document Library',
      description: 'Upload PDFs, presentations, and documents. Organize them into lessons for focused study sessions.',
    },
    {
      icon: FiMessageSquare,
      title: 'AI Study Assistant',
      description: 'Ask questions about your materials. Get instant answers powered by advanced AI that understands context.',
    },
    {
      icon: FiZap,
      title: 'Interactive Learning',
      description: 'Navigate through your documents while getting real-time help. Study smarter, not harder.',
    },
    {
      icon: FiTrendingUp,
      title: 'Track Progress',
      description: 'Monitor your learning journey with insights on lessons completed and study time.',
    },
  ]

  return (
    <div className="min-h-screen bg-dark-bg relative overflow-hidden">
      {/* Animated background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent-purple/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-blue/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 border-b border-dark-border/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-accent-purple to-accent-blue rounded-lg flex items-center justify-center">
                <FiBook className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold gradient-text">Studyz</span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/login')}
                className="text-gray-300 hover:text-white transition-colors px-4 py-2"
              >
                Sign In
              </button>
              <button
                onClick={() => router.push('/register')}
                className="btn-accent"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24">
        <div className="text-center space-y-8 animate-fade-in">
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 glass-card px-4 py-2 text-sm">
            <FiStar className="w-4 h-4 text-yellow-400" />
            <span className="text-gray-300">AI-Powered Study Platform</span>
          </div>

          {/* Main headline */}
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
            <span className="text-white">Study Smarter with</span>
            <br />
            <span className="gradient-text">AI-Powered Learning</span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Upload your study materials, organize them into lessons, and get instant AI assistance as you learn. 
            Transform the way you study.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={() => router.push('/register')}
              className="btn-accent flex items-center space-x-2 group"
            >
              <span>Start Learning Free</span>
              <FiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => router.push('/login')}
              className="btn-secondary flex items-center space-x-2"
            >
              <span>Sign In</span>
            </button>
          </div>

          {/* Hero Image / Preview */}
          <div className="pt-12 animate-slide-up">
            <div className="glass-card p-2 max-w-5xl mx-auto">
              <div className="bg-dark-surface rounded-xl p-8 border border-dark-border/50">
                <div className="aspect-video bg-gradient-to-br from-dark-elevated to-dark-surface rounded-lg flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-accent-purple to-accent-blue rounded-2xl mx-auto flex items-center justify-center glow-primary">
                      <FiBook className="w-10 h-10 text-white" />
                    </div>
                    <p className="text-gray-400">Your AI Study Hub</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Everything You Need to Excel
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Powerful features designed to enhance your learning experience
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="glass-card p-8 card-hover animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="w-12 h-12 bg-gradient-to-br from-accent-purple to-accent-blue rounded-xl flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="glass-card p-12 text-center card-hover">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Learning?
          </h2>
          <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
            Join students who are already studying smarter with AI assistance
          </p>
          <button
            onClick={() => router.push('/register')}
            className="btn-accent flex items-center space-x-2 mx-auto group"
          >
            <span>Get Started Now</span>
            <FiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-dark-border/50 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-accent-purple to-accent-blue rounded-lg flex items-center justify-center">
                <FiBook className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold gradient-text">Studyz</span>
            </div>
            <p className="text-gray-500 text-sm">
              © 2025 Studyz. AI-powered learning platform.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
