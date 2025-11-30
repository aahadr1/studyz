'use client'

import { useState, useRef, useEffect } from 'react'
import { FiSend, FiBook, FiMessageCircle } from 'react-icons/fi'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface SimpleInteractiveSidebarProps {
  lessonId: string
  currentPage: number
  totalPages: number
  getPageImage: () => string | null
}

export default function SimpleInteractiveSidebar({ 
  lessonId, 
  currentPage, 
  totalPages, 
  getPageImage 
}: SimpleInteractiveSidebarProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'chat'>('summary')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageExplanation, setPageExplanation] = useState<string>('')
  const [loadingExplanation, setLoadingExplanation] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Generate page explanation when page changes
  useEffect(() => {
    generatePageExplanation()
  }, [currentPage])

  const generatePageExplanation = async () => {
    setLoadingExplanation(true)
    try {
      const pageImage = getPageImage()
      
      const response = await fetch('/api/chat-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Explique cette page de cours de manière pédagogique. Résume le contenu principal, les concepts clés, et donne des conseils d\'apprentissage. Sois concis mais informatif.',
          lessonId,
          pageNumber: currentPage,
          totalPages,
          pageImage,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setPageExplanation(data.reply)
      } else {
        setPageExplanation('Impossible de générer l\'explication pour cette page.')
      }
    } catch (error) {
      setPageExplanation('Erreur lors de la génération de l\'explication.')
    } finally {
      setLoadingExplanation(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const pageImage = getPageImage()

      const response = await fetch('/api/chat-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          lessonId,
          pageNumber: currentPage,
          totalPages,
          pageImage,
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erreur: Impossible d\'obtenir une réponse' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header with tabs */}
      <div className="border-b border-border">
        <div className="flex">
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'summary'
                ? 'border-accent text-accent bg-accent-muted/20'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <FiBook className="w-4 h-4 inline mr-2" />
            Page
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'chat'
                ? 'border-accent text-accent bg-accent-muted/20'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <FiMessageCircle className="w-4 h-4 inline mr-2" />
            Chat
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'summary' && (
          <div className="p-4">
            <div className="mb-4">
              <h3 className="font-medium text-text-primary mb-2">
                Page {currentPage} / {totalPages}
              </h3>
            </div>
            
            {loadingExplanation ? (
              <div className="flex items-center justify-center py-8">
                <div className="spinner mr-3"></div>
                <span className="text-text-tertiary text-sm">Analyse de la page...</span>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none">
                <div className="text-text-secondary text-sm whitespace-pre-wrap">
                  {pageExplanation || 'Aucune explication disponible pour cette page.'}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            {/* Messages */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {messages.length === 0 && (
                <p className="text-text-tertiary text-sm text-center py-8">
                  Posez-moi des questions sur cette page
                </p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] p-3 rounded-lg text-sm ${
                    msg.role === 'user'
                      ? 'bg-accent text-white ml-auto'
                      : 'bg-elevated text-text-primary'
                  }`}
                >
                  {msg.content}
                </div>
              ))}
              {loading && (
                <div className="max-w-[85%] bg-elevated text-text-tertiary p-3 rounded-lg text-sm">
                  Réflexion...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Posez une question sur cette page..."
                  className="input flex-1"
                  disabled={loading}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="btn-primary px-3 disabled:opacity-50"
                >
                  <FiSend className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
