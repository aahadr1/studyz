'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { FiLock, FiChevronLeft, FiChevronRight } from 'react-icons/fi'

const PdfViewerInner = dynamic(() => import('./PdfViewerInner'), { ssr: false })

interface Section {
  id: string
  section_order: number
  title: string
  start_page: number
  end_page: number
}

interface InteractivePdfViewerProps {
  url: string
  sections: Section[]
  currentSectionIndex: number
  unlockedSections: Set<string>
  onPageChange: (page: number, totalPages: number) => void
  onSectionChange: (sectionIndex: number) => void
  onReachSectionEnd: () => void
}

export default function InteractivePdfViewer({
  url,
  sections,
  currentSectionIndex,
  unlockedSections,
  onPageChange,
  onSectionChange,
  onReachSectionEnd
}: InteractivePdfViewerProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)

  const currentSection = sections[currentSectionIndex]

  const getAccessiblePageRange = useCallback(() => {
    let minPage = 1
    let maxPage = totalPages

    for (let i = sections.length - 1; i >= 0; i--) {
      const section = sections[i]
      if (unlockedSections.has(section.id) || i === 0) {
        maxPage = section.end_page
        break
      }
    }

    return { minPage, maxPage }
  }, [sections, unlockedSections, totalPages])

  const isPageAccessible = useCallback((page: number) => {
    const { minPage, maxPage } = getAccessiblePageRange()
    return page >= minPage && page <= maxPage
  }, [getAccessiblePageRange])

  const handlePageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page)
    setTotalPages(total)
    onPageChange(page, total)

    const sectionIndex = sections.findIndex(
      s => page >= s.start_page && page <= s.end_page
    )
    if (sectionIndex !== -1 && sectionIndex !== currentSectionIndex) {
      onSectionChange(sectionIndex)
    }

    if (currentSection && page === currentSection.end_page) {
      onReachSectionEnd()
    }
  }, [sections, currentSectionIndex, currentSection, onPageChange, onSectionChange, onReachSectionEnd])

  const goToPrevPage = () => {
    if (currentPage > 1 && isPageAccessible(currentPage - 1)) {
      setCurrentPage(currentPage - 1)
    }
  }

  const goToNextPage = () => {
    const nextPage = currentPage + 1
    if (nextPage <= totalPages && isPageAccessible(nextPage)) {
      setCurrentPage(nextPage)
    } else if (currentSection && currentPage === currentSection.end_page) {
      onReachSectionEnd()
    }
  }

  const isNextLocked = () => {
    if (!currentSection) return false
    if (currentPage < currentSection.end_page) return false
    
    const nextSection = sections[currentSectionIndex + 1]
    if (!nextSection) return false
    
    return !unlockedSections.has(nextSection.id)
  }

  const getSectionForPage = (page: number) => {
    return sections.find(s => page >= s.start_page && page <= s.end_page)
  }

  const pageSection = getSectionForPage(currentPage)

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Section indicator */}
      {pageSection && (
        <div className="px-4 py-2 bg-elevated border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-accent">
              Section {pageSection.section_order}
            </span>
            <span className="text-sm text-text-primary font-medium truncate">
              {pageSection.title}
            </span>
          </div>
          <span className="text-xs text-text-tertiary">
            Pages {pageSection.start_page} - {pageSection.end_page}
          </span>
        </div>
      )}

      {/* Navigation controls */}
      <div className="flex items-center justify-center gap-4 py-3 border-b border-border">
        <button
          onClick={goToPrevPage}
          disabled={currentPage <= 1}
          className="btn-ghost p-2 disabled:opacity-30"
        >
          <FiChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-sm text-text-primary min-w-[100px] text-center">
          Page {currentPage} / {totalPages || '...'}
        </span>

        <button
          onClick={goToNextPage}
          disabled={currentPage >= totalPages && !isNextLocked()}
          className={`p-2 rounded-md transition-colors ${
            isNextLocked()
              ? 'bg-warning text-white hover:bg-warning/90'
              : 'btn-ghost disabled:opacity-30'
          }`}
        >
          {isNextLocked() ? (
            <FiLock className="w-5 h-5" />
          ) : (
            <FiChevronRight className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto">
        <PdfViewerInner
          url={url}
          page={currentPage}
          onLoadSuccess={(total) => {
            setTotalPages(total)
            onPageChange(currentPage, total)
          }}
        />
      </div>

      {/* Progress indicator */}
      {currentSection && (
        <div className="px-4 py-2 bg-elevated border-t border-border">
          <div className="flex items-center justify-between text-xs text-text-tertiary mb-1">
            <span>Section progress</span>
            <span>
              {currentPage - currentSection.start_page + 1} / {currentSection.end_page - currentSection.start_page + 1}
            </span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${((currentPage - currentSection.start_page + 1) / (currentSection.end_page - currentSection.start_page + 1)) * 100}%`
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
