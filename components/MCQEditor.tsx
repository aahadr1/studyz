'use client'

import { useState } from 'react'
import { FiEdit2, FiTrash2, FiCheck, FiX, FiPlus, FiSave } from 'react-icons/fi'

export interface MCQOption {
  label: string
  text: string
}

export interface MCQQuestionData {
  id: string
  question: string
  options: MCQOption[]
  correct_option: string
  question_type?: 'scq' | 'mcq'
  correct_options?: string[]
  explanation?: string
}

interface MCQEditorProps {
  questions: MCQQuestionData[]
  mcqSetId: string
  accessToken: string
  onUpdate: (questions: MCQQuestionData[]) => void
  enableSelection?: boolean
  onSelectionChange?: (selectedIds: string[]) => void
}

export default function MCQEditor({
  questions,
  mcqSetId,
  accessToken,
  onUpdate,
  enableSelection = false,
  onSelectionChange,
}: MCQEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<MCQQuestionData | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const emitSelection = (next: Set<string>) => {
    onSelectionChange?.(Array.from(next))
  }

  const handleEdit = (question: MCQQuestionData) => {
    setEditingId(question.id)
    const normalizedCorrectOptions =
      Array.isArray(question.correct_options) && question.correct_options.length > 0
        ? question.correct_options
        : (question.correct_option ? [question.correct_option] : [])
    const normalizedQuestionType: 'scq' | 'mcq' =
      question.question_type === 'mcq' || normalizedCorrectOptions.length > 1 ? 'mcq' : 'scq'

    setEditData({
      ...question,
      question_type: normalizedQuestionType,
      correct_options: normalizedCorrectOptions,
      options: [...question.options],
    })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditData(null)
  }

  const handleSave = async () => {
    if (!editData) return
    
    setSaving(true)
    try {
      const correctOptions =
        Array.isArray(editData.correct_options) && editData.correct_options.length > 0
          ? editData.correct_options
          : (editData.correct_option ? [editData.correct_option] : [])
      const questionType: 'scq' | 'mcq' =
        editData.question_type === 'mcq' || correctOptions.length > 1 ? 'mcq' : 'scq'
      const primaryCorrect = correctOptions[0] || editData.correct_option || 'A'

      const response = await fetch(`/api/mcq/${mcqSetId}/question/${editData.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: editData.question,
          options: editData.options,
          question_type: questionType,
          correct_options: correctOptions,
          correct_option: primaryCorrect,
          explanation: editData.explanation,
        }),
      })

      if (response.ok) {
        const updatedQuestions = questions.map(q => 
          q.id === editData.id ? editData : q
        )
        onUpdate(updatedQuestions)
        setEditingId(null)
        setEditData(null)
      }
    } catch (err) {
      console.error('Error saving question:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (questionId: string) => {
    try {
      const response = await fetch(`/api/mcq/${mcqSetId}/question/${questionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (response.ok) {
        onUpdate(questions.filter(q => q.id !== questionId))
        if (enableSelection) {
          setSelectedIds(prev => {
            const next = new Set(prev)
            next.delete(questionId)
            emitSelection(next)
            return next
          })
        }
      }
    } catch (err) {
      console.error('Error deleting question:', err)
    }
    setDeleteConfirm(null)
  }

  const handleOptionChange = (index: number, field: 'label' | 'text', value: string) => {
    if (!editData) return
    const newOptions = [...editData.options]
    newOptions[index] = { ...newOptions[index], [field]: value }
    setEditData({ ...editData, options: newOptions })
  }

  const handleAddOption = () => {
    if (!editData) return
    const nextLabel = String.fromCharCode(65 + editData.options.length) // A, B, C, D...
    setEditData({
      ...editData,
      options: [...editData.options, { label: nextLabel, text: '' }]
    })
  }

  const handleRemoveOption = (index: number) => {
    if (!editData || editData.options.length <= 2) return
    const removedLabel = editData.options[index]?.label
    const newOptions = editData.options.filter((_, i) => i !== index)
    // Re-label options
    const relabeledOptions = newOptions.map((opt, i) => ({
      ...opt,
      label: String.fromCharCode(65 + i)
    }))

    // Remap correct options after relabeling
    const oldLabels = editData.options.map(o => o.label)
    const oldToNew = new Map<string, string>()
    relabeledOptions.forEach((opt, i) => {
      // old index i maps to new label
      const oldLabel = oldLabels[i < index ? i : i + 1]
      if (oldLabel) oldToNew.set(oldLabel, opt.label)
    })

    const currentCorrectOptions =
      Array.isArray(editData.correct_options) && editData.correct_options.length > 0
        ? editData.correct_options
        : (editData.correct_option ? [editData.correct_option] : [])

    const remapped = currentCorrectOptions
      .filter(lbl => lbl !== removedLabel)
      .map(lbl => oldToNew.get(lbl) || lbl)
      .filter(lbl => relabeledOptions.some(o => o.label === lbl))

    const nextCorrectOptions = remapped.length > 0 ? remapped : [relabeledOptions[0]?.label || 'A']
    const nextQuestionType: 'scq' | 'mcq' =
      editData.question_type === 'mcq' || nextCorrectOptions.length > 1 ? 'mcq' : 'scq'

    setEditData({
      ...editData,
      options: relabeledOptions,
      question_type: nextQuestionType,
      correct_options: nextCorrectOptions,
      correct_option: nextCorrectOptions[0],
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-text-primary">
          Edit Questions ({questions.length})
        </h2>
        {enableSelection && questions.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => {
                const next = new Set(questions.map(q => q.id))
                setSelectedIds(next)
                emitSelection(next)
              }}
            >
              Select all
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => {
                const next = new Set<string>()
                setSelectedIds(next)
                emitSelection(next)
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-text-secondary">No questions to edit.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q, qIndex) => (
            <div key={q.id} className="card p-4">
              {editingId === q.id && editData ? (
                // Edit mode
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex-shrink-0 w-8 h-8 bg-accent text-white rounded-full flex items-center justify-center font-semibold text-sm">
                      {qIndex + 1}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                        title="Save"
                      >
                        <FiSave className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="p-2 bg-elevated text-text-secondary rounded-lg hover:bg-border"
                        title="Cancel"
                      >
                        <FiX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Question text */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Question</label>
                    <textarea
                      value={editData.question}
                      onChange={(e) => setEditData({ ...editData, question: e.target.value })}
                      className="w-full px-3 py-2 bg-elevated border border-border rounded-lg text-text-primary resize-none"
                      rows={3}
                    />
                  </div>

                  {/* Options */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Options</label>
                    <div className="flex items-center gap-3 mb-2">
                      <label className="text-xs text-text-secondary">Type:</label>
                      <select
                        value={editData.question_type || 'scq'}
                        onChange={(e) => {
                          const t = e.target.value === 'mcq' ? 'mcq' : 'scq'
                          const current =
                            Array.isArray(editData.correct_options) && editData.correct_options.length > 0
                              ? editData.correct_options
                              : (editData.correct_option ? [editData.correct_option] : [])
                          const next = t === 'scq' ? [current[0] || 'A'] : current
                          setEditData({
                            ...editData,
                            question_type: t,
                            correct_options: next,
                            correct_option: next[0] || 'A',
                          })
                        }}
                        className="px-2 py-1 bg-elevated border border-border rounded-lg text-xs text-text-primary"
                      >
                        <option value="scq">Single choice (SCQ)</option>
                        <option value="mcq">Multiple correct (MCQ)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      {editData.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {editData.question_type === 'mcq' ? (
                            <input
                              type="checkbox"
                              checked={Array.isArray(editData.correct_options) && editData.correct_options.includes(opt.label)}
                              onChange={() => {
                                const current = Array.isArray(editData.correct_options) ? editData.correct_options : []
                                const next = current.includes(opt.label)
                                  ? current.filter(x => x !== opt.label)
                                  : [...current, opt.label]
                                const final = next.length > 0 ? next : [opt.label]
                                setEditData({ ...editData, correct_options: final, correct_option: final[0] })
                              }}
                              className="w-4 h-4 text-accent"
                              title="Mark as correct"
                            />
                          ) : (
                            <input
                              type="radio"
                              name="correct_option"
                              checked={(Array.isArray(editData.correct_options) ? editData.correct_options[0] : editData.correct_option) === opt.label}
                              onChange={() => setEditData({ ...editData, correct_options: [opt.label], correct_option: opt.label })}
                              className="w-4 h-4 text-accent"
                              title="Mark as correct"
                            />
                          )}
                          <span className="w-8 h-8 bg-background rounded-full flex items-center justify-center font-semibold text-sm">
                            {opt.label}
                          </span>
                          <input
                            type="text"
                            value={opt.text}
                            onChange={(e) => handleOptionChange(i, 'text', e.target.value)}
                            className="flex-1 px-3 py-2 bg-elevated border border-border rounded-lg text-text-primary"
                            placeholder={`Option ${opt.label}`}
                          />
                          {editData.options.length > 2 && (
                            <button
                              onClick={() => handleRemoveOption(i)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                              title="Remove option"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {editData.options.length < 10 && (
                      <button
                        onClick={handleAddOption}
                        className="mt-2 flex items-center gap-1 text-sm text-accent hover:underline"
                      >
                        <FiPlus className="w-4 h-4" />
                        Add option
                      </button>
                    )}
                  </div>

                  {/* Explanation */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Explanation (optional)</label>
                    <textarea
                      value={editData.explanation || ''}
                      onChange={(e) => setEditData({ ...editData, explanation: e.target.value })}
                      className="w-full px-3 py-2 bg-elevated border border-border rounded-lg text-text-primary resize-none"
                      rows={2}
                      placeholder="Why is this the correct answer?"
                    />
                  </div>
                </div>
              ) : (
                // View mode
                <div>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-start gap-3">
                      {enableSelection && (
                        <input
                          type="checkbox"
                          className="mt-2"
                          checked={selectedIds.has(q.id)}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setSelectedIds(prev => {
                              const next = new Set(prev)
                              if (checked) next.add(q.id)
                              else next.delete(q.id)
                              emitSelection(next)
                              return next
                            })
                          }}
                        />
                      )}
                      <span className="flex-shrink-0 w-8 h-8 bg-accent text-white rounded-full flex items-center justify-center font-semibold text-sm">
                        {qIndex + 1}
                      </span>
                      <p className="text-text-primary font-medium pt-1">{q.question}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(q)}
                        className="p-2 text-text-tertiary hover:text-accent hover:bg-elevated rounded-lg transition-colors"
                        title="Edit"
                      >
                        <FiEdit2 className="w-4 h-4" />
                      </button>
                      {deleteConfirm === q.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(q.id)}
                            className="p-1 px-2 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-1 px-2 bg-elevated text-text-secondary text-xs rounded hover:bg-border"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(q.id)}
                          className="p-2 text-text-tertiary hover:text-red-500 hover:bg-elevated rounded-lg transition-colors"
                          title="Delete"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Options display */}
                  <div className="ml-11 space-y-2">
                    {q.options.map((opt) => (
                      (() => {
                        const corrects =
                          Array.isArray(q.correct_options) && q.correct_options.length > 0
                            ? q.correct_options
                            : (q.correct_option ? [q.correct_option] : [])
                        const isCorrect = corrects.includes(opt.label)
                        return (
                      <div
                        key={opt.label}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                          isCorrect
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-elevated'
                        }`}
                      >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                          isCorrect
                            ? 'bg-green-500 text-white'
                            : 'bg-background'
                        }`}>
                          {opt.label}
                        </span>
                        <span className={isCorrect ? 'text-green-900' : 'text-text-primary'}>
                          {opt.text}
                        </span>
                        {isCorrect && (
                          <FiCheck className="w-4 h-4 text-green-600 ml-auto" />
                        )}
                      </div>
                        )
                      })()
                    ))}
                  </div>

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="ml-11 mt-3 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-900">
                        <strong>Explanation:</strong> {q.explanation}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

