'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { 
  FiSend, 
  FiUser, 
  FiCpu, 
  FiEye, 
  FiCopy, 
  FiCheck, 
  FiTrash2,
  FiRefreshCw,
  FiBook,
  FiHelpCircle,
  FiZap,
  FiMessageSquare
} from 'react-icons/fi'

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
  pageContext?: number
  isError?: boolean
}

// Quick action suggestions
const quickActions = [
  { icon: FiBook, label: 'Summarize this page', prompt: 'Can you summarize the key points on this page?' },
  { icon: FiHelpCircle, label: 'Explain concept', prompt: 'Can you explain the main concept on this page in simple terms?' },
  { icon: FiZap, label: 'Key takeaways', prompt: 'What are the key takeaways I should remember from this page?' },
]

export default function ChatAssistant(props: ChatAssistantProps) {
  const { documentId, pageNumber, lessonId, getPageText } = props

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasVisualContext, setHasVisualContext] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Initialize with welcome message
  useEffect(() => {
    const welcomeMessage: Message = {
      id: 'welcome',
      role: 'assistant',
      content: `👋 Hi! I'm your AI study assistant.\n\nI can help you understand page ${pageNumber} of your document. Try asking me to:\n\n• Explain concepts or terminology\n• Summarize key points\n• Clarify confusing sections\n• Break down formulas or diagrams`,
      timestamp: new Date(),
    }
    setMessages([welcomeMessage])
  }, [])

  // Update welcome message when page changes
  useEffect(() => {
    if (messages.length > 0 && messages[0].id === 'welcome') {
      setMessages(prev => [{
        ...prev[0],
        content: `👋 Hi! I'm your AI study assistant.\n\nI can help you understand page ${pageNumber} of your document. Try asking me to:\n\n• Explain concepts or terminology\n• Summarize key points\n• Clarify confusing sections\n• Break down formulas or diagrams`,
      }, ...prev.slice(1)])
    }
  }, [pageNumber])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(messageId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const clearChat = () => {
    const welcomeMessage: Message = {
      id: 'welcome-' + Date.now(),
      role: 'assistant',
      content: `👋 Chat cleared! I'm ready to help you with page ${pageNumber}.\n\nWhat would you like to know?`,
      timestamp: new Date(),
    }
    setMessages([welcomeMessage])
    setShowQuickActions(true)
  }

  const handleQuickAction = (prompt: string) => {
    setInput(prompt)
    setShowQuickActions(false)
    inputRef.current?.focus()
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    const trimmedInput = input.trim()
    if (!trimmedInput || loading) return

    setInput('')
    setLoading(true)
    setShowQuickActions(false)

    const userMessage: Message = {
      id: String(Date.now()),
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
      pageContext: pageNumber,
    }
    
    const messagesWithUser = [...messages, userMessage]
    setMessages(messagesWithUser)

    try {
      let pageTextData = null
      if (getPageText) {
        pageTextData = await getPageText()
      }

      const history = messagesWithUser.slice(-10).map(msg => ({
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
        isError: true,
      }
      setMessages([...messagesWithUser, errorMessage])
    }

    setLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const retryLastMessage = () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMessage) {
      // Remove error message and retry
      setMessages(prev => prev.filter(m => !m.isError))
      setInput(lastUserMessage.content)
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <FiMessageSquare className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">AI Assistant</h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Viewing page {pageNumber}</span>
              </div>
            </div>
          </div>
          <button
            onClick={clearChat}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="Clear chat"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
        
        {hasVisualContext && (
          <div className="mt-2 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
            <FiEye className="w-3.5 h-3.5" />
            <span>Visual context enabled - I can see images and diagrams</span>
          </div>
        )}
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {messages.map((message, index) => {
          const isUser = message.role === 'user'
          const showTimestamp = index === 0 || 
            (messages[index - 1] && 
             message.timestamp.getTime() - messages[index - 1].timestamp.getTime() > 300000)

          return (
            <div key={message.id}>
              {showTimestamp && (
                <div className="flex justify-center mb-3">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
              )}
              
              <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
                <div className={`flex items-end gap-2 max-w-[88%] ${isUser ? 'flex-row-reverse' : ''}`}>
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    isUser 
                      ? 'bg-slate-200 dark:bg-slate-600' 
                      : 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md'
                  }`}>
                    {isUser ? (
                      <FiUser className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                    ) : (
                      <FiCpu className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                  
                  {/* Message bubble */}
                  <div className="relative">
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isUser 
                        ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 shadow-sm rounded-br-md' 
                        : message.isError
                          ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-bl-md'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-bl-md'
                    }`}>
                      {isUser && message.pageContext && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1 font-medium uppercase tracking-wide">
                          Page {message.pageContext}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      
                      {message.isError && (
                        <button
                          onClick={retryLastMessage}
                          className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:underline"
                        >
                          <FiRefreshCw className="w-3 h-3" />
                          Retry
                        </button>
                      )}
                    </div>
                    
                    {/* Copy button */}
                    {!isUser && !message.isError && (
                      <button
                        onClick={() => copyToClipboard(message.content, message.id)}
                        className="absolute -right-8 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-all"
                        title="Copy message"
                      >
                        {copiedId === message.id ? (
                          <FiCheck className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <FiCopy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        
        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-end gap-2 max-w-[88%]">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                <FiCpu className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-slate-100 dark:bg-slate-800">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick actions */}
        {showQuickActions && messages.length <= 1 && !loading && (
          <div className="pt-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">Quick actions</p>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickAction(action.prompt)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-colors shadow-sm"
                >
                  <action.icon className="w-3 h-3" />
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this page..."
              rows={1}
              className="w-full px-4 py-2.5 pr-12 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm leading-relaxed"
              disabled={loading}
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <div className="absolute right-3 bottom-2.5 text-[10px] text-slate-400">
              {input.length > 0 && `${input.length}/2000`}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 disabled:opacity-50 disabled:shadow-none transition-all disabled:cursor-not-allowed"
          >
            <FiSend className="w-4 h-4" />
          </button>
        </form>
        <div className="flex items-center justify-between mt-2 px-1">
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            <span className="inline-flex items-center gap-1">
              <FiEye className="w-3 h-3" />
              AI can see page {pageNumber}
            </span>
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            Press Enter to send
          </p>
        </div>
      </div>
    </div>
  )
}
