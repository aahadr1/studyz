'use client'

import { useState, useRef, useEffect } from 'react'
import { FiSend, FiUser, FiCpu, FiEye } from 'react-icons/fi'

interface ChatAssistantProps {
  documentId: string
  pageNumber: number
  lessonId: string
  getPageText?: () => Promise<string | null>
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function ChatAssistant(props: ChatAssistantProps) {
  const documentId = props.documentId
  const pageNumber = props.pageNumber
  const lessonId = props.lessonId
  const getPageText = props.getPageText

  const initialMessage: Message = {
    id: '1',
    role: 'assistant',
    content: `Hi! I'm your AI study assistant. I can see page ${pageNumber} of your document.\n\nAsk me about:\n• Text or diagrams on this page\n• Concept explanations\n• Clarifications\n• Formula help`,
    timestamp: new Date(),
  }

  const [messages, setMessages] = useState<Message[]>([initialMessage])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasVisualContext, setHasVisualContext] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const trimmedInput = input.trim()
    if (!trimmedInput || loading) return

    setInput('')
    setLoading(true)

    const userMessage: Message = {
      id: String(Date.now()),
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    }
    
    const messagesWithUser = [...messages, userMessage]
    setMessages(messagesWithUser)

    try {
      let pageTextData = null
      if (getPageText) {
        pageTextData = await getPageText()
      }

      const history = messagesWithUser.map(msg => ({
        role: msg.role,
        content: msg.content,
      }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedInput,
          documentId,
          pageNumber,
          lessonId,
          pageText: pageTextData,
          conversationHistory: history,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const responseData = await response.json()

      if (responseData.hasVisualContext !== undefined) {
        setHasVisualContext(responseData.hasVisualContext)
      }

      const assistantMessage: Message = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: responseData.response,
        timestamp: new Date(),
      }

      setMessages([...messagesWithUser, assistantMessage])
    } catch (error: any) {
      const errorMessage: Message = {
        id: String(Date.now() + 2),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }
      setMessages([...messagesWithUser, errorMessage])
    }

    setLoading(false)
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      {hasVisualContext && (
        <div className="px-4 py-2 bg-success-muted border-b border-success/20 flex items-center gap-2 text-xs text-success">
          <FiEye className="w-3 h-3" />
          <span>Visual context enabled</span>
        </div>
      )}
      
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((message) => {
          const isUser = message.role === 'user'

          return (
            <div
              key={message.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-start gap-2 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                  isUser ? 'bg-accent' : 'bg-elevated'
                }`}>
                  {isUser ? (
                    <FiUser className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <FiCpu className="w-3.5 h-3.5 text-accent" />
                  )}
                </div>
                <div className={`px-3 py-2 rounded-lg text-sm ${
                  isUser 
                    ? 'bg-accent text-white' 
                    : 'bg-elevated text-text-primary'
                }`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            </div>
          )
        })}
        
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-start gap-2 max-w-[85%]">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-elevated flex items-center justify-center">
                <FiCpu className="w-3.5 h-3.5 text-accent" />
              </div>
              <div className="px-3 py-2 rounded-lg bg-elevated">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this page..."
            className="input flex-1"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-primary px-3 disabled:opacity-50"
          >
            <FiSend className="w-4 h-4" />
          </button>
        </form>
        <p className="text-xs text-text-tertiary mt-2">
          AI can see the current page content
        </p>
      </div>
    </div>
  )
}
