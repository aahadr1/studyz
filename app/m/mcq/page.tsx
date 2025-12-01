'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { MobileHeader, FloatingActionButton, EmptyState, BottomSheet } from '@/components/mobile/MobileLayout'
import { 
  FiPlus, 
  FiCheckSquare, 
  FiTrash2, 
  FiArrowRight,
  FiMoreVertical,
  FiCalendar,
  FiHelpCircle,
  FiEdit2,
  FiPlay,
  FiCheckCircle,
  FiBook
} from 'react-icons/fi'

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

  useEffect(() => {
    loadMcqSets()
  }, [])

  const loadMcqSets = async () => {
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
  }

  const handleDelete = async () => {
    if (!selectedSet) return
    
    setDeleting(true)
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
        title="Quiz Sets" 
        rightAction={
          <Link href="/m/mcq/new" className="mobile-header-action">
            <FiPlus className="w-6 h-6" />
          </Link>
        }
      />

      <div className="mobile-content">
        {mcqSets.length === 0 ? (
          <EmptyState
            icon={<FiCheckSquare />}
            title="No quizzes yet"
            description="Upload a PDF with MCQs or paste text to create your first quiz set"
            action={
              <Link href="/m/mcq/new" className="btn-mobile btn-primary-mobile">
                <FiPlus className="w-5 h-5" />
                Create Quiz
              </Link>
            }
          />
        ) : (
          <div className="px-4 py-4 space-y-3 stagger-children">
            {mcqSets.map((mcq) => (
              <div key={mcq.id} className="item-card pr-2">
                <Link
                  href={`/m/mcq/${mcq.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <div className="item-card-icon bg-[var(--color-secondary-soft)]">
                    <FiCheckSquare className="text-[var(--color-secondary)]" />
                  </div>
                  <div className="item-card-content">
                    <div className="flex items-center gap-2">
                      <h3 className="item-card-title flex-1">{mcq.name}</h3>
                      {mcq.is_corrected && (
                        <span className="badge-mobile success">
                          <FiCheckCircle className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                      <span className="flex items-center gap-1">
                        <FiHelpCircle className="w-3 h-3" />
                        {mcq.total_questions} Q
                      </span>
                      <span className="flex items-center gap-1">
                        <FiCalendar className="w-3 h-3" />
                        {formatDate(mcq.created_at)}
                      </span>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    setSelectedSet(mcq)
                    setShowActionSheet(true)
                  }}
                  className="p-2 -mr-1 text-[var(--color-text-tertiary)]"
                >
                  <FiMoreVertical className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <FloatingActionButton
        href="/m/mcq/new"
        icon={<FiPlus />}
        label="New quiz"
      />

      {/* Action Sheet */}
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
            className="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-surface)] active:bg-[var(--color-surface-hover)] transition-colors"
            onClick={() => setShowActionSheet(false)}
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-accent-soft)] flex items-center justify-center">
              <FiPlay className="w-5 h-5 text-[var(--color-accent)]" />
            </div>
            <span className="font-medium text-[var(--color-text-primary)]">Practice Quiz</span>
          </Link>
          
          <Link
            href={`/m/mcq/${selectedSet?.id}/edit`}
            className="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-surface)] active:bg-[var(--color-surface-hover)] transition-colors"
            onClick={() => setShowActionSheet(false)}
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-secondary-soft)] flex items-center justify-center">
              <FiEdit2 className="w-5 h-5 text-[var(--color-secondary)]" />
            </div>
            <span className="font-medium text-[var(--color-text-primary)]">Edit Questions</span>
          </Link>
          
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-surface)] active:bg-[var(--color-error-soft)] transition-colors w-full"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-error-soft)] flex items-center justify-center">
              {deleting ? (
                <div className="spinner-mobile w-5 h-5" style={{ borderWidth: '2px', borderTopColor: 'var(--color-error)' }} />
              ) : (
                <FiTrash2 className="w-5 h-5 text-[var(--color-error)]" />
              )}
            </div>
            <span className="font-medium text-[var(--color-error)]">
              {deleting ? 'Deleting...' : 'Delete Quiz'}
            </span>
          </button>
        </div>
      </BottomSheet>
    </MobileLayout>
  )
}

