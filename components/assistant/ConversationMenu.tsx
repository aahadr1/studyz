'use client'

import { useState, useEffect } from 'react'
import { FiX, FiMessageSquare, FiClock, FiTrash2, FiDownload } from 'react-icons/fi'
import type { AssistantMessage } from './AssistantPanel'

interface SavedConversation {
  id: string
  name: string
  messages: AssistantMessage[]
  createdAt: string
  pageContext: number
}

interface ConversationMenuProps {
  lessonId: string
  onClose: () => void
  onLoadConversation: (messages: AssistantMessage[]) => void
}

export default function ConversationMenu({
  lessonId,
  onClose,
  onLoadConversation,
}: ConversationMenuProps) {
  const [conversations, setConversations] = useState<SavedConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Load saved conversations from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`studyz-conversations-${lessonId}`)
    if (stored) {
      try {
        setConversations(JSON.parse(stored))
      } catch {
        setConversations([])
      }
    }
  }, [lessonId])

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = conversations.filter(c => c.id !== id)
    setConversations(updated)
    localStorage.setItem(`studyz-conversations-${lessonId}`, JSON.stringify(updated))
    if (selectedId === id) setSelectedId(null)
  }

  const handleLoad = (conversation: SavedConversation) => {
    onLoadConversation(conversation.messages)
    onClose()
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      
      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-80 bg-background border-l border-border flex flex-col animate-in">
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-border">
          <h2 className="font-medium text-text-primary">Saved Conversations</h2>
          <button
            onClick={onClose}
            className="p-2 text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <FiMessageSquare className="w-12 h-12 text-text-tertiary mb-4" />
              <p className="text-sm text-text-secondary mb-2">No saved conversations</p>
              <p className="text-xs text-text-tertiary">
                Conversations with bookmarked messages will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => handleLoad(conversation)}
                  className="group px-4 py-3 hover:bg-elevated cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-text-primary truncate">
                        {conversation.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <FiClock className="w-3 h-3 text-text-tertiary" />
                        <span className="text-xs text-text-tertiary">
                          {formatDate(conversation.createdAt)}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          · {conversation.messages.length} messages
                        </span>
                      </div>
                      {/* Preview of first message */}
                      <p className="text-xs text-text-tertiary mt-2 line-clamp-2">
                        {conversation.messages[0]?.content.slice(0, 100)}...
                      </p>
                    </div>
                    
                    {/* Actions */}
                    <button
                      onClick={(e) => handleDelete(conversation.id, e)}
                      className="p-1.5 text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete conversation"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <p className="text-xs text-text-tertiary text-center">
            Tip: Bookmark important messages to save conversations
          </p>
        </div>
      </div>
    </div>
  )
}

