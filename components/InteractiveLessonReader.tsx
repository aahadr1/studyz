'use client'

import { useState, useEffect, useRef } from 'react'
import { FiChevronLeft, FiChevronRight, FiSend, FiLoader } from 'react-icons/fi'
import dynamic from 'next/dynamic'

// Dynamically import react-pdf to avoid SSR issues
const PdfViewerComponent = dynamic(() => import('./SimplePdfViewerWithCapture'), { 
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="spinner"></div>
    </div>
  )
})

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface InteractiveLessonReaderProps {
  lessonId: string
  lessonName: string
  pdfUrl: string
}

export default function InteractiveLessonReader({
  lessonId,
  lessonName,
  pdfUrl,
}: InteractiveLessonReaderProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [getPageImage, setGetPageImage] = useState<() => string | null>(() => () => null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handlePageChange = (page: number, total: number) => {
    setCurrentPage(page)
    setTotalPages(total)
  }

  const handleCanvasReady = (getImage: () => string | null) => {
    setGetPageImage(() => getImage)
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      // Capture current page image
      const pageImageBase64 = getPageImage()

      if (!pageImageBase64) {
        throw new Error('Could not capture page image')
      }

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

  return (
    <div className="flex h-full">
      {/* Left Side: PDF Viewer */}
      <div className="flex-1 flex flex-col bg-background min-w-0">
        <PdfViewerComponent
          url={pdfUrl}
          onPageChange={handlePageChange}
          onCanvasReady={handleCanvasReady}
        />
      </div>

      {/* Right Side: AI Chat */}
      <div className="w-96 border-l border-border flex flex-col bg-surface flex-shrink-0">
        {/* Chat Header */}
        <div className="h-14 border-b border-border flex items-center px-4">
          <h3 className="font-semibold text-text-primary">Assistant IA</h3>
          <span className="ml-auto text-xs text-text-tertiary">
            Page {currentPage} / {totalPages}
          </span>
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
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="btn-primary px-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiSend className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
