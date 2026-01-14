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
  FiDownload,
  FiAlertCircle
} from 'react-icons/fi'

interface MCQQuestion {
  id: string
  question: string
  options: Array<{ label: string; text: string }>
  correctOption?: string
  correctOptions?: string[]
  questionType?: 'scq' | 'mcq'
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [startingSelection, setStartingSelection] = useState(false)
  const [rangeInput, setRangeInput] = useState('')
  const [exporting, setExporting] = useState<'with_answers' | 'no_answers' | null>(null)
  
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
    questionType: 'scq' as 'scq' | 'mcq',
    correctOptions: ['A'] as string[],
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
    const normalizedOptions = (question.options && question.options.length >= 2)
      ? question.options
      : [
          { label: 'A', text: question.options?.[0]?.text || '' },
          { label: 'B', text: question.options?.[1]?.text || '' },
          { label: 'C', text: question.options?.[2]?.text || '' },
          { label: 'D', text: question.options?.[3]?.text || '' },
        ]
    const normalizedCorrectOptions =
      Array.isArray(question.correctOptions) && question.correctOptions.length > 0
        ? question.correctOptions
        : (question.correctOption ? [question.correctOption] : ['A'])
    const normalizedQuestionType: 'scq' | 'mcq' =
      question.questionType === 'mcq' || normalizedCorrectOptions.length > 1 ? 'mcq' : 'scq'

    setEditingQuestion(question)
    setEditForm({
      question: question.question,
      options: normalizedOptions,
      questionType: normalizedQuestionType,
      correctOptions: normalizedQuestionType === 'scq' ? [normalizedCorrectOptions[0] || 'A'] : normalizedCorrectOptions,
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
          question_type: editForm.questionType,
          correct_options: editForm.correctOptions,
          correct_option: (editForm.correctOptions?.[0] || 'A'),
          explanation: editForm.explanation,
        }),
      })

      if (response.ok) {
        // Update local state
        setQuestions(questions.map(q => 
          q.id === editingQuestion.id 
            ? { ...q, ...editForm, correctOption: editForm.correctOptions?.[0] || 'A', correctOptions: editForm.correctOptions, questionType: editForm.questionType }
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
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.delete(questionId)
          return next
        })
      }
    } catch (error) {
      console.error('Error deleting question:', error)
    }
  }

  const handleStudySelected = async () => {
    if (!accessToken || selectedIds.size === 0 || startingSelection) return
    setStartingSelection(true)
    try {
      const orderedIds = questions.map(q => q.id).filter(id => selectedIds.has(id))
      const res = await fetch(`/api/mcq/${mcqSetId}/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'study',
          questionIds: orderedIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create session')
      const sessionId = data.session?.id
      if (!sessionId) throw new Error('Missing session id')
      router.push(`/m/mcq/${mcqSetId}?session=${sessionId}`)
    } catch (e) {
      console.error('Failed to start selection session:', e)
    } finally {
      setStartingSelection(false)
    }
  }

  const downloadExport = async (mode: 'with_answers' | 'no_answers') => {
    if (!accessToken || exporting) return
    setExporting(mode)
    try {
      const res = await fetch(`/api/mcq/${mcqSetId}/export?mode=${mode}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const details = data?.details
        const msg =
          (data?.error || 'Failed to export PDF') +
          (details ? `\n\nDetails: ${typeof details === 'string' ? details : JSON.stringify(details)}` : '')
        throw new Error(msg)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${mcqSet?.name || 'mcq'}-${mode === 'with_answers' ? 'with-answers' : 'no-answers'}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed:', e)
      alert((e as any)?.message || 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  const applyRangeSelection = () => {
    const cleaned = rangeInput.trim().replace(/\s+/g, '')
    const m = cleaned.match(/^(\d+)[-–—:](\d+)$/)
    if (!m) return
    const start = parseInt(m[1], 10)
    const end = parseInt(m[2], 10)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) return
    const a = Math.min(start, end)
    const b = Math.max(start, end)
    const startIdx = Math.max(0, a - 1)
    const endIdx = Math.min(questions.length - 1, b - 1)
    if (questions.length === 0 || startIdx > endIdx) return
    const ids = questions.slice(startIdx, endIdx + 1).map(q => q.id)
    setSelectedIds(new Set(ids))
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadExport('with_answers')}
              className="mobile-header-action"
              title="Export PDF (with answers)"
              disabled={!!exporting}
            >
              <FiDownload className="w-5 h-5" />
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={handleStudySelected}
                className="mobile-header-action"
                title="Study selected"
                disabled={startingSelection}
              >
                <FiPlay className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={() => router.push(`/m/mcq/${mcqSetId}`)}
              className="mobile-header-action"
              title="Practice all"
            >
              <FiPlay className="w-5 h-5" />
            </button>
          </div>
        }
      />

      <div className="mobile-content">
        {/* Header Info */}
        <div className="px-4 py-4 border-b border-[var(--color-border)]">
          <h2 className="font-bold text-[var(--color-text-primary)]">{mcqSet?.name}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {questions.length} question{questions.length !== 1 ? 's' : ''}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              placeholder="Range (e.g. 20-50)"
              className="flex-1 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm"
            />
            <button
              type="button"
              onClick={applyRangeSelection}
              disabled={!rangeInput.trim()}
              className="btn-secondary text-xs disabled:opacity-50"
            >
              Select
            </button>
          </div>
        </div>

        {/* Questions List */}
        <div className="px-4 py-4 space-y-3">
          {questions.map((question, index) => (
            <div 
              key={question.id}
              className="mobile-card p-4"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedIds.has(question.id)}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setSelectedIds(prev => {
                      const next = new Set(prev)
                      if (checked) next.add(question.id)
                      else next.delete(question.id)
                      return next
                    })
                  }}
                />
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
                    Answer: {(question.correctOptions && question.correctOptions.length > 0) ? question.correctOptions.join(', ') : (question.correctOption || '')}
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
          {/* Question Type */}
          <div className="input-group-mobile">
            <label className="input-label-mobile">Type</label>
            <select
              value={editForm.questionType}
              onChange={(e) => {
                const t = e.target.value === 'mcq' ? 'mcq' : 'scq'
                const current = Array.isArray(editForm.correctOptions) && editForm.correctOptions.length > 0 ? editForm.correctOptions : ['A']
                const next = t === 'scq' ? [current[0] || 'A'] : current
                setEditForm({ ...editForm, questionType: t, correctOptions: next })
              }}
              className="input-mobile"
            >
              <option value="scq">Single choice (SCQ)</option>
              <option value="mcq">Multiple correct (MCQ)</option>
            </select>
          </div>

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
                  onClick={() => {
                    const current = Array.isArray(editForm.correctOptions) ? editForm.correctOptions : []
                    if (editForm.questionType === 'mcq') {
                      const next = current.includes(option.label)
                        ? current.filter(x => x !== option.label)
                        : [...current, option.label]
                      const final = next.length > 0 ? next : [option.label]
                      setEditForm({ ...editForm, correctOptions: final })
                    } else {
                      setEditForm({ ...editForm, correctOptions: [option.label] })
                    }
                  }}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    (editForm.correctOptions || []).includes(option.label)
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

