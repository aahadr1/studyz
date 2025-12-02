'use client'

import { useState } from 'react'
import { 
  FiMessageSquare, 
  FiChevronDown, 
  FiChevronUp,
  FiTrash2,
  FiDownload,
  FiSearch,
  FiX,
  FiMaximize2,
  FiMinimize2,
  FiFolder,
  FiMoreVertical
} from 'react-icons/fi'

interface AssistantHeaderProps {
  currentPage: number
  totalPages: number
  showContext: boolean
  onToggleContext: () => void
  onShowConversations: () => void
  onClearChat: () => void
  onExportChat: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  isExpanded: boolean
  onToggleExpand: () => void
  onClose?: () => void
}

export default function AssistantHeader({
  currentPage,
  totalPages,
  showContext,
  onToggleContext,
  onShowConversations,
  onClearChat,
  onExportChat,
  searchQuery,
  onSearchChange,
  isExpanded,
  onToggleExpand,
  onClose,
}: AssistantHeaderProps) {
  const [showSearch, setShowSearch] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="flex-shrink-0 border-b border-border bg-surface">
      {/* Main Header Row */}
      <div className="flex items-center justify-between h-12 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-mode-study flex items-center justify-center">
            <FiMessageSquare className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-primary">AI Assistant</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-success animate-pulse" />
              <span className="text-xs text-text-tertiary mono">
                Page {currentPage}/{totalPages}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Search Toggle */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2 transition-colors ${showSearch ? 'text-text-primary bg-elevated' : 'text-text-tertiary hover:text-text-secondary'}`}
            title="Search messages"
          >
            <FiSearch className="w-4 h-4" />
          </button>

          {/* Context Toggle */}
          <button
            onClick={onToggleContext}
            className={`p-2 transition-colors ${showContext ? 'text-text-primary bg-elevated' : 'text-text-tertiary hover:text-text-secondary'}`}
            title={showContext ? 'Hide context' : 'Show context'}
          >
            {showContext ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
          </button>

          {/* More Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-text-tertiary hover:text-text-secondary transition-colors"
            >
              <FiMoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border z-50 animate-in">
                  <button
                    onClick={() => { onShowConversations(); setShowMenu(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm text-text-secondary hover:bg-elevated hover:text-text-primary flex items-center gap-2"
                  >
                    <FiFolder className="w-4 h-4" />
                    Saved Conversations
                  </button>
                  <button
                    onClick={() => { onExportChat(); setShowMenu(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm text-text-secondary hover:bg-elevated hover:text-text-primary flex items-center gap-2"
                  >
                    <FiDownload className="w-4 h-4" />
                    Export Chat
                  </button>
                  <div className="border-t border-border" />
                  <button
                    onClick={() => { onClearChat(); setShowMenu(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm text-error hover:bg-error-muted flex items-center gap-2"
                  >
                    <FiTrash2 className="w-4 h-4" />
                    Clear Chat
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Expand/Collapse */}
          <button
            onClick={onToggleExpand}
            className="p-2 text-text-tertiary hover:text-text-secondary transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <FiMinimize2 className="w-4 h-4" /> : <FiMaximize2 className="w-4 h-4" />}
          </button>

          {/* Close (if handler provided) */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-text-tertiary hover:text-text-secondary transition-colors"
              title="Close"
            >
              <FiX className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="px-4 pb-3">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search messages..."
              className="w-full pl-10 pr-10 py-2 bg-elevated border border-border text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-text-secondary"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
              >
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

