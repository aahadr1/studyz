'use client'

import { useState, useEffect, useRef } from 'react'
import { FiChevronLeft, FiChevronRight, FiSend, FiLoader } from 'react-icons/fi'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface InteractiveLessonReaderProps {
  lessonId: string
  lessonName: string
  totalPages: number
}

export default function InteractiveLessonReader({
  lessonId,
  lessonName,
  totalPages,
}: InteractiveLessonReaderProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null)
  const [pageImageBase64, setPageImageBase64] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPage, setLoadingPage] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load page image when currentPage changes
  useEffect(() => {
    loadPageImage()
  }, [currentPage, lessonId])

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadPageImage = async () => {
    setLoadingPage(true)
    try {
      // Get signed URL for the page image
      const response = await fetch(`/api/interactive-lessons/${lessonId}/page-image/${currentPage}`)
      
      if (!response.ok) {
        console.error('Failed to load page image')
        return
      }

      const data = await response.json()
      setPageImageUrl(data.signedUrl)

      // Also load as base64 for sending to AI
      const imageResponse = await fetch(data.signedUrl)
      const imageBlob = await imageResponse.blob()
      const reader = new FileReader()
      
      reader.onloadend = () => {
        setPageImageBase64(reader.result as string)
      }
      
      reader.readAsDataURL(imageBlob)

    } catch (error) {
      console.error('Error loading page:', error)
    } finally {
      setLoadingPage(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading || !pageImageBase64) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const response = await fetch(`/api/interactive-lessons/${lessonId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          pageNumber: currentPage,
          pageImageBase64,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Désolé, une erreur s\'est produite.' }
      ])
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

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  return (
    <div className="flex h-full">
      {/* Left Side: PDF Viewer */}
      <div className="flex-1 flex flex-col bg-background">
        {/* Page Navigation */}
        <div className="h-14 border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              className="btn-ghost p-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <FiChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-sm text-text-secondary">
              Page <span className="font-semibold text-text-primary">{currentPage}</span> / {totalPages}
            </div>
            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="btn-ghost p-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <FiChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Page Display */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-gray-50">
          {loadingPage ? (
            <div className="flex items-center gap-3 text-text-tertiary">
              <FiLoader className="w-5 h-5 animate-spin" />
              <span>Chargement de la page...</span>
            </div>
          ) : pageImageUrl ? (
            <div className="relative max-w-full max-h-full">
              <img
                src={pageImageUrl}
                alt={`Page ${currentPage}`}
                className="max-w-full max-h-full object-contain shadow-lg"
              />
            </div>
          ) : (
            <div className="text-text-tertiary">
              Impossible de charger la page
            </div>
          )}
        </div>
      </div>

      {/* Right Side: AI Chat */}
      <div className="w-96 border-l border-border flex flex-col bg-surface">
        {/* Chat Header */}
        <div className="h-14 border-b border-border flex items-center px-4">
          <h3 className="font-semibold text-text-primary">Assistant IA</h3>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-text-tertiary text-sm py-8">
              <p>Posez des questions sur cette page</p>
              <p className="text-xs mt-2">L&apos;IA voit exactement ce que vous voyez</p>
            </div>
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
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}
          {loading && (
            <div className="max-w-[85%] bg-elevated text-text-tertiary p-3 rounded-lg text-sm flex items-center gap-2">
              <FiLoader className="w-4 h-4 animate-spin" />
              <span>Réflexion...</span>
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
              placeholder="Posez une question..."
              className="input flex-1"
              disabled={loading || loadingPage}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim() || loadingPage || !pageImageBase64}
              className="btn-primary px-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiSend className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-text-tertiary mt-2">
            Page {currentPage} • {messages.length} messages
          </p>
        </div>
      </div>
    </div>
  )
}

