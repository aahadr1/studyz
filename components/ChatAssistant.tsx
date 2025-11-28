'use client'

import { useState, useRef, useEffect } from 'react'
import { FiSend, FiUser, FiCpu, FiEye } from 'react-icons/fi'

interface ChatAssistantProps {
  documentId: string
  pageNumber: number
  lessonId: string
  getPageImage?: () => Promise<string | null>
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function ChatAssistant({
  documentId,
  pageNumber,
  lessonId,
  getPageImage,
}: ChatAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hi! I'm Studyz Guy, your AI study assistant. 👋\n\nI can see the current page you're viewing (Page ${pageNumber}). I have full visual context of your document, so feel free to ask me:\n\n• Questions about specific text or diagrams you see\n• Explanations of concepts on this page\n• Clarifications about anything unclear\n• Help with understanding formulas or examples\n\nJust ask naturally about what you're looking at, and I'll help! 📚`,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasVisualContext, setHasVisualContext] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // Update context when page changes
    setMessages(function(prev) {
      const newMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `I can now see Page ${pageNumber}. What would you like to know about this page?`,
        timestamp: new Date(),
      }
      const newMessages = prev.slice()
      newMessages.push(newMessage)
      return newMessages
    })
  }, [pageNumber, documentId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() || loading) return

    const currentInput = input
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentInput,
      timestamp: new Date(),
    }

    setMessages(function(prev) {
      const newMessages = prev.slice()
      newMessages.push(userMessage)
      return newMessages
    })
    
    setInput('')
    setLoading(true)

    try {
      // Always try to get current page image for GPT context
      let pageImageData = null
      if (getPageImage) {
        console.log('📸 Capturing page image for GPT context...')
        pageImageData = await getPageImage()
        if (pageImageData) {
          console.log('✅ Page image ready for GPT (with visual context)')
        } else {
          console.log('⚠️ No page image available (text-only mode)')
        }
      } else {
        console.log('⚠️ getPageImage function not available')
      }

      // Prepare conversation history safely (avoid minification issues)
      const conversationHistory = messages.map(function(msg) {
        return {
          role: msg.role,
          content: msg.content,
        }
      })

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentInput,
          documentId: documentId,
          pageNumber: pageNumber,
          lessonId: lessonId,
          pageImageData: pageImageData,
          conversationHistory: conversationHistory,
        }),
      })

      if (!response.ok) {
        let errorData: any = {}
        try {
          errorData = await response.json()
        } catch (e) {
          // Ignore JSON parse errors
        }
        const errorMessage = errorData.error || 'Failed to get response'
        throw new Error(errorMessage)
      }

      const data = await response.json()

      // Update visual context status
      if (data.hasVisualContext !== undefined) {
        setHasVisualContext(data.hasVisualContext)
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      }

      setMessages(function(prev) {
        const newMessages = prev.slice()
        newMessages.push(assistantMessage)
        return newMessages
      })
    } catch (error: any) {
      console.error('Error sending message:', error)
      
      let errorContent = 'Sorry, I encountered an error. Please try again.'
      
      // Provide more specific error messages
      if (error.message && error.message.includes('API key')) {
        errorContent = '⚠️ OpenAI API is not configured. Please contact support.'
      } else if (error.message && error.message.includes('quota')) {
        errorContent = '⚠️ API quota exceeded. Please try again later.'
      } else if (error.message && error.message.includes('Failed to fetch')) {
        errorContent = '⚠️ Network error. Please check your connection and try again.'
      } else if (error.message) {
        errorContent = `⚠️ ${error.message}`
      }
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      }

      setMessages(function(prev) {
        const newMessages = prev.slice()
        newMessages.push(errorMessage)
        return newMessages
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Visual Context Indicator */}
      {hasVisualContext && (
        <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center space-x-2 text-xs text-green-400">
          <FiEye className="w-4 h-4" />
          <span>GPT can see your page (visual context enabled)</span>
        </div>
      )}
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(function(message) {
          const isUser = message.role === 'user'
          const timeString = message.timestamp.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })
          
          return (
            <div
              key={message.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`flex items-start space-x-2 max-w-[85%] ${
                  isUser ? 'flex-row-reverse space-x-reverse' : ''
                }`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isUser
                      ? 'bg-primary-100'
                      : 'bg-purple-100'
                  }`}
                >
                  {isUser ? (
                    <FiUser className="w-4 h-4 text-primary-600" />
                  ) : (
                    <FiCpu className="w-4 h-4 text-purple-600" />
                  )}
                </div>
                <div
                  className={`px-4 py-3 rounded-2xl ${
                    isUser
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isUser ? 'text-primary-100' : 'text-gray-500'
                    }`}
                  >
                    {timeString}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-start space-x-2 max-w-[85%]">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <FiCpu className="w-4 h-4 text-purple-600" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-gray-100">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={function(e) { setInput(e.target.value) }}
            placeholder="Ask about this page..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiSend className="w-5 h-5" />
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          The AI can see the current page you're viewing and will answer based on its content.
        </p>
      </div>
    </div>
  )
}
