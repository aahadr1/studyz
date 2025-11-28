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

export default function ChatAssistant(props: ChatAssistantProps) {
  const documentId = props.documentId
  const pageNumber = props.pageNumber
  const lessonId = props.lessonId
  const getPageImage = props.getPageImage

  const initialMessage: Message = {
    id: '1',
    role: 'assistant',
    content: 'Hi! I\'m Studyz Guy, your AI study assistant. 👋\n\nI can see the current page you\'re viewing (Page ' + pageNumber + '). I have full visual context of your document, so feel free to ask me:\n\n• Questions about specific text or diagrams you see\n• Explanations of concepts on this page\n• Clarifications about anything unclear\n• Help with understanding formulas or examples\n\nJust ask naturally about what you\'re looking at, and I\'ll help! 📚',
    timestamp: new Date(),
  }

  const [messages, setMessages] = useState<Message[]>([initialMessage])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasVisualContext, setHasVisualContext] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = function() {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }

  useEffect(function() {
    scrollToBottom()
  }, [messages])

  const handleInputChange = function(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value)
  }

  const handleSubmit = async function(e: React.FormEvent) {
    e.preventDefault()
    
    const trimmedInput = input.trim()
    if (!trimmedInput || loading) {
      return
    }

    const savedInput = trimmedInput
    setInput('')
    setLoading(true)

    // Add user message
    const userMessage: Message = {
      id: String(Date.now()),
      role: 'user',
      content: savedInput,
      timestamp: new Date(),
    }
    
    const messagesWithUser: Message[] = []
    for (let i = 0; i < messages.length; i++) {
      messagesWithUser.push(messages[i])
    }
    messagesWithUser.push(userMessage)
    setMessages(messagesWithUser)

    try {
      // Get page image
      let pageImageData = null
      if (getPageImage) {
        console.log('📸 Capturing page image for GPT context...')
        pageImageData = await getPageImage()
        if (pageImageData) {
          console.log('✅ Page image ready for GPT')
        } else {
          console.log('⚠️ No page image available')
        }
      }

      // Prepare conversation history
      const history: Array<{ role: string; content: string }> = []
      for (let i = 0; i < messagesWithUser.length; i++) {
        const msg = messagesWithUser[i]
        history.push({
          role: msg.role,
          content: msg.content,
        })
      }

      // Call API
      const requestBody = {
        message: savedInput,
        documentId: documentId,
        pageNumber: pageNumber,
        lessonId: lessonId,
        pageImageData: pageImageData,
        conversationHistory: history,
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      let responseData: any = null
      if (response.ok) {
        responseData = await response.json()
      } else {
        let errorMessage = 'Failed to get response'
        try {
          const errorData = await response.json()
          if (errorData && errorData.error) {
            errorMessage = errorData.error
          }
        } catch (e) {
          // ignore
        }
        throw new Error(errorMessage)
      }

      // Update visual context
      if (responseData && responseData.hasVisualContext !== undefined) {
        setHasVisualContext(responseData.hasVisualContext)
      }

      // Add assistant message
      const assistantMessage: Message = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: responseData.response,
        timestamp: new Date(),
      }

      const messagesWithAssistant: Message[] = []
      for (let i = 0; i < messagesWithUser.length; i++) {
        messagesWithAssistant.push(messagesWithUser[i])
      }
      messagesWithAssistant.push(assistantMessage)
      setMessages(messagesWithAssistant)

    } catch (error: any) {
      console.error('Error sending message:', error)
      
      let errorContent = 'Sorry, I encountered an error. Please try again.'
      
      if (error && error.message) {
        const errorMsg = String(error.message)
        if (errorMsg.indexOf('API key') >= 0) {
          errorContent = '⚠️ OpenAI API is not configured. Please contact support.'
        } else if (errorMsg.indexOf('quota') >= 0) {
          errorContent = '⚠️ API quota exceeded. Please try again later.'
        } else if (errorMsg.indexOf('Failed to fetch') >= 0) {
          errorContent = '⚠️ Network error. Please check your connection.'
        } else {
          errorContent = '⚠️ ' + errorMsg
        }
      }

      const errorMessage: Message = {
        id: String(Date.now() + 2),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      }

      const messagesWithError: Message[] = []
      for (let i = 0; i < messagesWithUser.length; i++) {
        messagesWithError.push(messagesWithUser[i])
      }
      messagesWithError.push(errorMessage)
      setMessages(messagesWithError)
    }

    setLoading(false)
  }

  // Render messages
  const messageElements = []
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    const isUser = message.role === 'user'
    const timeString = message.timestamp.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })

    messageElements.push(
      <div
        key={message.id}
        className={isUser ? 'flex justify-end' : 'flex justify-start'}
      >
        <div
          className={'flex items-start space-x-2 max-w-[85%] ' + (isUser ? 'flex-row-reverse space-x-reverse' : '')}
        >
          <div
            className={'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ' + (isUser ? 'bg-primary-100' : 'bg-purple-100')}
          >
            {isUser ? (
              <FiUser className="w-4 h-4 text-primary-600" />
            ) : (
              <FiCpu className="w-4 h-4 text-purple-600" />
            )}
          </div>
          <div
            className={'px-4 py-3 rounded-2xl ' + (isUser ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-900')}
          >
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            <p className={'text-xs mt-1 ' + (isUser ? 'text-primary-100' : 'text-gray-500')}>
              {timeString}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {hasVisualContext && (
        <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center space-x-2 text-xs text-green-400">
          <FiEye className="w-4 h-4" />
          <span>GPT can see your page (visual context enabled)</span>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messageElements}
        
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

      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
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
          The AI can see the current page you are viewing and will answer based on its content.
        </p>
      </div>
    </div>
  )
}

