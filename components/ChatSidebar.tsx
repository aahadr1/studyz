'use client'

import { useState, useRef, useEffect } from 'react'
import { FiSend } from 'react-icons/fi'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatSidebarProps {
  documentId: string
  currentPage: number
  totalPages: number
  getPageImage: () => string | null
}

export default function ChatSidebar({ documentId, currentPage, totalPages, getPageImage }: ChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
          documentId,
          pageNumber: currentPage,
          totalPages,
          pageImage,
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Could not get response' }])
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
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border">
        <span className="font-medium text-text-primary">Assistant</span>
        <span className="text-xs text-text-tertiary">Page {currentPage} / {totalPages}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-text-tertiary text-sm text-center py-8">
            Ask me anything about this page
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
            Thinking...
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
            placeholder="Ask about this page..."
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
  )
}
