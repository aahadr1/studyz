'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MobileLayout, { MobileHeader, BottomSheet } from '@/components/mobile/MobileLayout'
import { 
  FiChevronLeft,
  FiPlus,
  FiTrash2,
  FiSave,
  FiCheck,
  FiX,
  FiEdit2,
  FiPlay,
  FiAlertCircle
} from 'react-icons/fi'

interface MCQQuestion {
  id: string
  question: string
  options: Array<{ label: string; text: string }>
  correctOption: string
  explanation?: string
}

export default function MobileMCQEditPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const mcqSetId = resolvedParams.id

  const [mcqSet, setMcqSet] = useState<any>(null)
  const [questions, setQuestions] = useState<MCQQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accessToken, setAccessToken] = useState('')
  
  // Editing state
  const [editingQuestion, setEditingQuestion] = useState<MCQQuestion | null>(null)
  const [showEditSheet, setShowEditSheet] = useState(false)
  const [editForm, setEditForm] = useState({
    question: '',
    options: [
      { label: 'A', text: '' },
      { label: 'B', text: '' },
      { label: 'C', text: '' },
      { label: 'D', text: '' },
    ],
    correctOption: 'A',
    explanation: ''
  })

  useEffect(() => {
    loadMCQSet()
  }, [mcqSetId])

  const loadMCQSet = async () => {
    const supabase = createClient()
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/m/login')
        return
      }

      setAccessToken(session.access_token)

      const response = await fetch(`/api/mcq/${mcqSetId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setMcqSet(data.set)
        setQuestions(data.questions || [])
      } else {
        router.push('/m/mcq')
      }
    } catch (error) {
      console.error('Error loading MCQ set:', error)
    } finally {
      setLoading(false)
    }
  }

  const openEditSheet = (question: MCQQuestion) => {
    setEditingQuestion(question)
    setEditForm({
      question: question.question,
      options: question.options.length === 4 ? question.options : [
        { label: 'A', text: question.options[0]?.text || '' },
        { label: 'B', text: question.options[1]?.text || '' },
        { label: 'C', text: question.options[2]?.text || '' },
        { label: 'D', text: question.options[3]?.text || '' },
      ],
      correctOption: question.correctOption,
      explanation: question.explanation || ''
    })
    setShowEditSheet(true)
  }

  const handleSaveQuestion = async () => {
    if (!editingQuestion) return
    
    setSaving(true)
    
    try {
      const response = await fetch(`/api/mcq/${mcqSetId}/question/${editingQuestion.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: editForm.question,
          options: editForm.options,
          correctOption: editForm.correctOption,
          explanation: editForm.explanation,
        }),
      })

      if (response.ok) {
        // Update local state
        setQuestions(questions.map(q => 
          q.id === editingQuestion.id 
            ? { ...q, ...editForm }
            : q
        ))
        setShowEditSheet(false)
        setEditingQuestion(null)
      }
    } catch (error) {
      console.error('Error saving question:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteQuestion = async (questionId: string) => {
    try {
      const response = await fetch(`/api/mcq/${mcqSetId}/question/${questionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })

      if (response.ok) {
        setQuestions(questions.filter(q => q.id !== questionId))
      }
    } catch (error) {
      console.error('Error deleting question:', error)
    }
  }

  if (loading) {
    return (
      <div className="mobile-app flex items-center justify-center">
        <div className="spinner-mobile" />
      </div>
    )
  }

  return (
    <MobileLayout hideTabBar={true}>
      <MobileHeader 
        title="Edit Questions"
        backHref={`/m/mcq/${mcqSetId}`}
        rightAction={
          <button 
            onClick={() => router.push(`/m/mcq/${mcqSetId}`)}
            className="mobile-header-action"
          >
            <FiPlay className="w-5 h-5" />
          </button>
        }
      />

      <div className="mobile-content">
        {/* Header Info */}
        <div className="px-4 py-4 border-b border-[var(--color-border)]">
          <h2 className="font-bold text-[var(--color-text-primary)]">{mcqSet?.name}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {questions.length} question{questions.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Questions List */}
        <div className="px-4 py-4 space-y-3">
          {questions.map((question, index) => (
            <div 
              key={question.id}
              className="mobile-card p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[var(--color-surface-hover)] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[var(--color-text-secondary)]">
                    {index + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--color-text-primary)] line-clamp-2 mb-2">
                    {question.question}
                  </p>
                  <p className="text-xs text-[var(--color-success)]">
                    Answer: {question.correctOption}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
                <button
                  onClick={() => openEditSheet(question)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--color-surface-hover)] text-[var(--color-text-primary)] text-sm font-medium"
                >
                  <FiEdit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteQuestion(question.id)}
                  className="flex items-center justify-center p-2 rounded-lg bg-[var(--color-error-soft)] text-[var(--color-error)]"
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Question Sheet */}
      <BottomSheet
        isOpen={showEditSheet}
        onClose={() => setShowEditSheet(false)}
        title="Edit Question"
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Question Text */}
          <div className="input-group-mobile">
            <label className="input-label-mobile">Question</label>
            <textarea
              value={editForm.question}
              onChange={(e) => setEditForm({ ...editForm, question: e.target.value })}
              className="input-mobile min-h-[80px] resize-y"
              placeholder="Enter question..."
            />
          </div>

          {/* Options */}
          {editForm.options.map((option, index) => (
            <div key={option.label} className="input-group-mobile">
              <label className="input-label-mobile">Option {option.label}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={option.text}
                  onChange={(e) => {
                    const newOptions = [...editForm.options]
                    newOptions[index] = { ...option, text: e.target.value }
                    setEditForm({ ...editForm, options: newOptions })
                  }}
                  className="input-mobile flex-1"
                  placeholder={`Option ${option.label}`}
                />
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, correctOption: option.label })}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    editForm.correctOption === option.label
                      ? 'bg-[var(--color-success)] text-white'
                      : 'bg-[var(--color-surface)] text-[var(--color-text-tertiary)]'
                  }`}
                >
                  <FiCheck className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}

          {/* Explanation */}
          <div className="input-group-mobile">
            <label className="input-label-mobile">Explanation (Optional)</label>
            <textarea
              value={editForm.explanation}
              onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
              className="input-mobile min-h-[60px] resize-y"
              placeholder="Why is this the correct answer?"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowEditSheet(false)}
              className="btn-mobile btn-secondary-mobile flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveQuestion}
              disabled={saving || !editForm.question.trim()}
              className="btn-mobile btn-primary-mobile flex-1"
            >
              {saving ? (
                <>
                  <div className="spinner-mobile w-4 h-4" style={{ borderWidth: '2px' }} />
                  Saving...
                </>
              ) : (
                <>
                  <FiSave className="w-4 h-4" />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      </BottomSheet>
    </MobileLayout>
  )
}

