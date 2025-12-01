'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { 
  MobileHeader, 
  FloatingActionButton, 
  EmptyState, 
  BottomSheet,
  PullToRefreshIndicator
} from '@/components/mobile/MobileLayout'
import { usePullToRefresh, useHapticFeedback } from '@/components/mobile/useMobileUtils'
import { FiPlus, FiTrash2, FiMoreVertical, FiArrowRight, FiEdit2, FiPlay } from 'react-icons/fi'

interface McqSet {
  id: string
  name: string
  source_pdf_name: string
  total_pages: number
  total_questions: number
  is_corrected?: boolean
  created_at: string
}

export default function MobileMCQPage() {
  const router = useRouter()
  const [mcqSets, setMcqSets] = useState<McqSet[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSet, setSelectedSet] = useState<McqSet | null>(null)
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { triggerHaptic } = useHapticFeedback()

  const loadMcqSets = useCallback(async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/m/login')
        return
      }

      const response = await fetch('/api/mcq/list', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setMcqSets(data.sets || [])
      }
    } catch (error) {
      console.error('Error loading MCQ sets:', error)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadMcqSets()
  }, [loadMcqSets])

  const {
    containerRef,
    isRefreshing,
    pullProgress
  } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic('medium')
      await loadMcqSets()
    }
  })

  const handleDelete = async () => {
    if (!selectedSet) return
    
    setDeleting(true)
    triggerHaptic('warning')
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/mcq/${selectedSet.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })

      if (response.ok) {
        setMcqSets(mcqSets.filter(s => s.id !== selectedSet.id))
      }
    } catch (error) {
      console.error('Error deleting MCQ set:', error)
    } finally {
      setDeleting(false)
      setShowActionSheet(false)
      setSelectedSet(null)
    }
  }

  if (loading) {
    return (
      <MobileLayout>
        <MobileHeader title="Quiz" />
        <div className="mobile-content flex items-center justify-center">
          <div className="spinner-mobile" />
        </div>
      </MobileLayout>
    )
  }

  return (
    <MobileLayout>
      <MobileHeader 
        title="Quiz" 
        rightAction={
          <Link href="/m/mcq/new" className="mobile-header-action">
            <FiPlus className="w-5 h-5" strokeWidth={1.5} />
          </Link>
        }
      />

      <div ref={containerRef} className="mobile-content">
        <PullToRefreshIndicator progress={pullProgress} isRefreshing={isRefreshing} />

        {mcqSets.length === 0 ? (
          <EmptyState
            icon={<span className="text-lg mono">0</span>}
            title="No Quizzes"
            description="Upload a PDF with MCQs to get started"
            action={
              <Link href="/m/mcq/new" className="btn-mobile btn-primary-mobile">
                Create Quiz
              </Link>
            }
          />
        ) : (
          <div>
            {/* Count */}
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)] mono">
                {mcqSets.length} quiz{mcqSets.length !== 1 ? 'zes' : ''}
              </span>
            </div>
            
            {/* List */}
            {mcqSets.map((mcq) => (
              <div 
                key={mcq.id} 
                className="flex items-center border-b border-[var(--color-border)]"
              >
                <Link
                  href={`/m/mcq/${mcq.id}`}
                  className="flex-1 flex items-center justify-between px-4 py-4 active:bg-[var(--color-surface)]"
                  onClick={() => triggerHaptic('light')}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm truncate">{mcq.name}</h3>
                      {mcq.is_corrected && (
                        <span className="text-[8px] uppercase tracking-wider border border-[var(--color-border)] px-1.5 py-0.5">
                          ✓
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] mono mt-0.5">
                      {mcq.total_questions} questions
                    </p>
                  </div>
                  <FiArrowRight className="w-4 h-4 text-[var(--color-text-tertiary)] ml-4" strokeWidth={1} />
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    triggerHaptic('light')
                    setSelectedSet(mcq)
                    setShowActionSheet(true)
                  }}
                  className="px-4 py-4 text-[var(--color-text-tertiary)] active:opacity-50"
                >
                  <FiMoreVertical className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <FloatingActionButton
        href="/m/mcq/new"
        icon={<FiPlus strokeWidth={1.5} />}
        label="New"
      />

      <BottomSheet
        isOpen={showActionSheet}
        onClose={() => {
          setShowActionSheet(false)
          setSelectedSet(null)
        }}
        title={selectedSet?.name}
      >
        <div className="space-y-2">
          <Link
            href={`/m/mcq/${selectedSet?.id}`}
            className="flex items-center justify-between p-4 border border-[var(--color-border)] active:bg-[var(--color-surface)]"
            onClick={() => setShowActionSheet(false)}
          >
            <span className="font-medium text-sm">Practice</span>
            <FiPlay className="w-4 h-4" strokeWidth={1.5} />
          </Link>
          
          <Link
            href={`/m/mcq/${selectedSet?.id}/edit`}
            className="flex items-center justify-between p-4 border border-[var(--color-border)] active:bg-[var(--color-surface)]"
            onClick={() => setShowActionSheet(false)}
          >
            <span className="font-medium text-sm">Edit</span>
            <FiEdit2 className="w-4 h-4" strokeWidth={1.5} />
          </Link>
          
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-between p-4 border border-[var(--color-border)] active:bg-[var(--color-surface)] w-full"
          >
            <span className="font-medium text-sm">Delete</span>
            {deleting ? (
              <div className="spinner-mobile w-4 h-4" />
            ) : (
              <FiTrash2 className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </BottomSheet>
    </MobileLayout>
  )
}
