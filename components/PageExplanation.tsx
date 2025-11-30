'use client'

import { useState, useMemo } from 'react'
import { FiX, FiBook, FiCode, FiType, FiImage, FiFileText } from 'react-icons/fi'

interface PageElement {
  id: string
  element_type: 'term' | 'concept' | 'formula' | 'diagram' | 'definition'
  element_text: string
  explanation: string
  color?: string
  position_hint?: string
}

interface PageExplanationProps {
  transcription: string
  elements: PageElement[]
  hasVisualContent?: boolean
  visualElements?: Array<{
    type: string
    description: string
    position?: string
  }>
  pageNumber: number
}

// Color mapping for element types
const elementColors: Record<string, { bg: string; border: string; text: string }> = {
  term: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-400' },
  concept: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400' },
  formula: { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-400' },
  diagram: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400' },
  definition: { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400' }
}

// Icons for element types
const elementIcons: Record<string, React.ReactNode> = {
  term: <FiType className="w-3 h-3" />,
  concept: <FiBook className="w-3 h-3" />,
  formula: <FiCode className="w-3 h-3" />,
  diagram: <FiImage className="w-3 h-3" />,
  definition: <FiFileText className="w-3 h-3" />
}

export default function PageExplanation({
  transcription,
  elements,
  hasVisualContent,
  visualElements,
  pageNumber
}: PageExplanationProps) {
  const [selectedElement, setSelectedElement] = useState<PageElement | null>(null)
  const [hoveredElement, setHoveredElement] = useState<string | null>(null)

  // Create highlighted text by finding and wrapping element_text occurrences
  const highlightedContent = useMemo(() => {
    if (!transcription || elements.length === 0) {
      return transcription || ''
    }

    let result = transcription
    const replacements: Array<{ original: string; replacement: string; element: PageElement }> = []

    // Sort elements by length (longest first) to avoid partial matches
    const sortedElements = [...elements].sort((a, b) => b.element_text.length - a.element_text.length)

    // Find all occurrences of element texts
    for (const element of sortedElements) {
      const regex = new RegExp(`(${escapeRegExp(element.element_text)})`, 'gi')
      if (regex.test(result)) {
        replacements.push({
          original: element.element_text,
          replacement: `__HIGHLIGHT_${element.id}__`,
          element
        })
        result = result.replace(regex, `__HIGHLIGHT_${element.id}__`)
      }
    }

    return { text: result, replacements }
  }, [transcription, elements])

  // Escape special regex characters
  function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  // Render highlighted text with clickable spans
  const renderHighlightedText = () => {
    if (typeof highlightedContent === 'string') {
      return <p className="text-text-secondary leading-relaxed whitespace-pre-wrap">{highlightedContent}</p>
    }

    const { text, replacements } = highlightedContent
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let currentText = text

    // Find all highlight markers and replace them with styled spans
    const markerRegex = /__HIGHLIGHT_([^_]+)__/g
    let match

    while ((match = markerRegex.exec(text)) !== null) {
      // Add text before this match
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {text.slice(lastIndex, match.index)}
          </span>
        )
      }

      // Find the element for this marker
      const elementId = match[1]
      const replacement = replacements.find(r => r.element.id === elementId)
      
      if (replacement) {
        const elem = replacement.element
        const colors = elementColors[elem.element_type] || elementColors.term
        const isHovered = hoveredElement === elem.id
        const isSelected = selectedElement?.id === elem.id

        parts.push(
          <button
            key={`elem-${elem.id}-${match.index}`}
            onClick={() => setSelectedElement(elem)}
            onMouseEnter={() => setHoveredElement(elem.id)}
            onMouseLeave={() => setHoveredElement(null)}
            className={`
              inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border cursor-pointer
              transition-all duration-150 font-medium
              ${colors.bg} ${colors.border}
              ${isHovered || isSelected ? 'ring-2 ring-offset-1 ring-offset-background ring-accent scale-105' : ''}
            `}
          >
            <span className={colors.text}>{elementIcons[elem.element_type]}</span>
            <span className="text-text-primary">{replacement.original}</span>
          </button>
        )
      }

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-end`}>
          {text.slice(lastIndex)}
        </span>
      )
    }

    return <div className="text-text-secondary leading-relaxed whitespace-pre-wrap">{parts}</div>
  }

  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Page {pageNumber}</h3>
          {hasVisualContent && (
            <span className="flex items-center gap-1 text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
              <FiImage className="w-3 h-3" />
              Visual content
            </span>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-4">
        {/* Element Legend */}
        {elements.length > 0 && (
          <div className="mb-4 p-3 bg-elevated rounded-lg">
            <p className="text-xs text-text-tertiary mb-2">Click highlighted terms for explanations:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(elementColors).map(([type, colors]) => {
                const count = elements.filter(e => e.element_type === type).length
                if (count === 0) return null
                return (
                  <span
                    key={type}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${colors.bg} ${colors.border} border`}
                  >
                    <span className={colors.text}>{elementIcons[type]}</span>
                    <span className="text-text-secondary capitalize">{type}</span>
                    <span className="text-text-tertiary">({count})</span>
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Transcription with highlights */}
        <div className="prose prose-invert prose-sm max-w-none">
          {transcription ? (
            renderHighlightedText()
          ) : (
            <p className="text-text-tertiary italic">No transcription available for this page.</p>
          )}
        </div>

        {/* Visual Elements Description */}
        {visualElements && visualElements.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
              <FiImage className="w-4 h-4 text-purple-400" />
              Visual Elements
            </h4>
            <div className="space-y-3">
              {visualElements.map((ve, idx) => (
                <div key={idx} className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-purple-400 font-medium capitalize">{ve.type}</span>
                    {ve.position && (
                      <span className="text-xs text-text-tertiary">• {ve.position}</span>
                    )}
                  </div>
                  <p className="text-sm text-text-secondary">{ve.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Element Quick List */}
        {elements.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-text-primary mb-3">Key Terms & Concepts</h4>
            <div className="grid grid-cols-1 gap-2">
              {elements.slice(0, 10).map((elem) => {
                const colors = elementColors[elem.element_type] || elementColors.term
                return (
                  <button
                    key={elem.id}
                    onClick={() => setSelectedElement(elem)}
                    className={`
                      text-left p-2 rounded-lg border transition-all
                      ${colors.bg} ${colors.border}
                      hover:ring-2 hover:ring-accent/50
                      ${selectedElement?.id === elem.id ? 'ring-2 ring-accent' : ''}
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <span className={colors.text}>{elementIcons[elem.element_type]}</span>
                      <span className="text-sm font-medium text-text-primary">{elem.element_text}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selected Element Popover */}
      {selectedElement && (
        <div className="flex-shrink-0 p-4 border-t border-border bg-elevated">
          <div className="relative">
            <button
              onClick={() => setSelectedElement(null)}
              className="absolute -top-1 -right-1 p-1 text-text-tertiary hover:text-text-primary rounded-full hover:bg-surface"
            >
              <FiX className="w-4 h-4" />
            </button>
            <div className="pr-6">
              <div className="flex items-center gap-2 mb-2">
                <span className={elementColors[selectedElement.element_type]?.text}>
                  {elementIcons[selectedElement.element_type]}
                </span>
                <span className="text-sm font-medium text-text-primary capitalize">
                  {selectedElement.element_type}
                </span>
              </div>
              <h4 className="font-semibold text-text-primary mb-2">{selectedElement.element_text}</h4>
              <p className="text-sm text-text-secondary leading-relaxed">{selectedElement.explanation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

