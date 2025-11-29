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

  // Calculate which pages are accessible
  const getAccessiblePageRange = useCallback(() => {
    let minPage = 1
    let maxPage = totalPages

    // Find the highest unlocked section
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

    // Determine which section this page belongs to
    const sectionIndex = sections.findIndex(
      s => page >= s.start_page && page <= s.end_page
    )
    if (sectionIndex !== -1 && sectionIndex !== currentSectionIndex) {
      onSectionChange(sectionIndex)
    }

    // Check if we've reached the end of current section
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
      // At section end, trigger quiz
      onReachSectionEnd()
    }
  }

  // Check if next button should show lock or arrow
  const isNextLocked = () => {
    if (!currentSection) return false
    if (currentPage < currentSection.end_page) return false
    
    // At section end, check if next section is unlocked
    const nextSection = sections[currentSectionIndex + 1]
    if (!nextSection) return false // Last section
    
    return !unlockedSections.has(nextSection.id)
  }

  // Get section info for current page
  const getSectionForPage = (page: number) => {
    return sections.find(s => page >= s.start_page && page <= s.end_page)
  }

  const pageSection = getSectionForPage(currentPage)

  return (
    <div className="flex flex-col h-full bg-neutral-900">
      {/* Section indicator */}
      {pageSection && (
        <div className="px-4 py-2 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-violet-400">
              Section {pageSection.section_order}
            </span>
            <span className="text-sm text-white font-medium truncate">
              {pageSection.title}
            </span>
          </div>
          <div className="text-xs text-gray-400">
            Pages {pageSection.start_page} - {pageSection.end_page}
          </div>
        </div>
      )}

      {/* Navigation controls */}
      <div className="flex items-center justify-center gap-4 p-3 border-b border-neutral-700 bg-neutral-900">
        <button
          onClick={goToPrevPage}
          disabled={currentPage <= 1}
          className="p-2 bg-neutral-800 rounded-lg disabled:opacity-30 text-white hover:bg-neutral-700 transition"
        >
          <FiChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-white min-w-[120px] text-center">
          Page {currentPage} / {totalPages || '...'}
        </span>

        <button
          onClick={goToNextPage}
          disabled={currentPage >= totalPages && !isNextLocked()}
          className={`p-2 rounded-lg text-white transition ${
            isNextLocked()
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30'
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
        <div className="px-4 py-2 bg-neutral-800 border-t border-neutral-700">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Section progress</span>
            <span>
              {currentPage - currentSection.start_page + 1} / {currentSection.end_page - currentSection.start_page + 1} pages
            </span>
          </div>
          <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all"
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

