'use client'

import { useState } from 'react'
import { FiEye, FiZap, FiBookOpen, FiHelpCircle, FiList, FiImage } from 'react-icons/fi'

interface ContextPanelProps {
  pageImageUrl?: string
  currentPage: number
  onQuickAsk: (prompt: string) => void
}

const quickPrompts = [
  { icon: FiBookOpen, label: 'Summarize', prompt: 'Summarize the key points on this page in bullet points.' },
  { icon: FiHelpCircle, label: 'Explain', prompt: 'Explain the main concept on this page in simple terms.' },
  { icon: FiZap, label: 'Key takeaways', prompt: 'What are the 3 most important takeaways from this page?' },
  { icon: FiList, label: 'Define terms', prompt: 'List and define any technical terms or vocabulary on this page.' },
]

export default function ContextPanel({
  pageImageUrl,
  currentPage,
  onQuickAsk,
}: ContextPanelProps) {
  const [showThumbnail, setShowThumbnail] = useState(false)

  return (
    <div className="flex-shrink-0 border-b border-border bg-elevated/50 p-4 space-y-3">
      {/* Visual Context Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-success-muted border border-success/30">
            <FiEye className="w-3 h-3 text-success" />
            <span className="text-xs text-success mono">Visual context enabled</span>
          </div>
        </div>
        
        {pageImageUrl && (
          <button
            onClick={() => setShowThumbnail(!showThumbnail)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary border border-border hover:border-border-light transition-colors"
          >
            <FiImage className="w-3 h-3" />
            {showThumbnail ? 'Hide' : 'Preview'}
          </button>
        )}
      </div>

      {/* Page Thumbnail */}
      {showThumbnail && pageImageUrl && (
        <div className="relative border border-border bg-background p-2">
          <img
            src={pageImageUrl}
            alt={`Page ${currentPage} preview`}
            className="w-full h-auto max-h-32 object-contain"
          />
          <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-background/90 border border-border">
            <span className="text-xs mono text-text-tertiary">Page {currentPage}</span>
          </div>
        </div>
      )}

      {/* Quick Ask Buttons */}
      <div>
        <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Quick actions</p>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((item, index) => (
            <button
              key={index}
              onClick={() => onQuickAsk(item.prompt)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary bg-surface border border-border hover:border-border-light hover:text-text-primary transition-colors"
            >
              <item.icon className="w-3 h-3" />
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

