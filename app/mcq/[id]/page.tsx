'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { FiLoader, FiEdit2, FiBook, FiZap, FiCheck, FiArrowLeft } from 'react-icons/fi'
import Link from 'next/link'
import MCQViewer, { MCQQuestion, Lesson } from '@/components/MCQViewer'

export default function MCQSetPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const mcqSetId = params.id as string
  const sessionId = searchParams.get('session')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mcqSet, setMcqSet] = useState<any>(null)
  const [questions, setQuestions] = useState<MCQQuestion[]>([])
  const [activeSessionQuestionIds, setActiveSessionQuestionIds] = useState<string[] | null>(null)
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [generatingLesson, setGeneratingLesson] = useState(false)
  const [generatingLessonCards, setGeneratingLessonCards] = useState(false)
  const [autoCorrecting, setAutoCorrecting] = useState(false)

  useEffect(() => {
    const loadMCQSet = async () => {
      const supabase = createClient()
      
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
          window.location.href = '/login'
          return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setError('Not authenticated')
          setIsLoading(false)
          return
        }

        const response = await fetch(`/api/mcq/${mcqSetId}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Failed to load MCQ set')
        }

        const data = await response.json()
        setMcqSet(data.set)
        setLesson(data.set.lesson_content || null)

        let nextQuestions: MCQQuestion[] = data.questions || []

        if (sessionId) {
          const sessionRes = await fetch(
            `/api/mcq/${mcqSetId}/session?sessionId=${encodeURIComponent(sessionId)}`,
            { headers: { 'Authorization': `Bearer ${session.access_token}` } }
          )
          const sessionData = await sessionRes.json()
          const ids: string[] | null =
            sessionRes.ok && Array.isArray(sessionData.session?.question_ids)
              ? sessionData.session.question_ids
              : null

          if (ids && ids.length > 0) {
            setActiveSessionQuestionIds(ids)
            const byId = new Map(nextQuestions.map((q: any) => [q.id, q]))
            nextQuestions = ids.map(id => byId.get(id)).filter(Boolean) as MCQQuestion[]
          } else {
            setActiveSessionQuestionIds(null)
          }
        } else {
          setActiveSessionQuestionIds(null)
        }

        setQuestions(nextQuestions)
      } catch (err: any) {
        console.error('Load error:', err)
        setError(err.message || 'Failed to load MCQ set')
      } finally {
        setIsLoading(false)
      }
    }

    loadMCQSet()
  }, [mcqSetId, sessionId])

  const handleGenerateLesson = async () => {
    setGeneratingLesson(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) return

      const response = await fetch(`/api/mcq/${mcqSetId}/generate-lesson`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      const data = await response.json()
      
      if (response.ok && data.lesson) {
        setLesson(data.lesson)
        
        const questionsResponse = await fetch(`/api/mcq/${mcqSetId}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })
        
        if (questionsResponse.ok) {
          const questionsData = await questionsResponse.json()
          setQuestions(questionsData.questions || [])
        }
      } else {
        console.error('Failed to generate lesson:', data.error)
      }
    } catch (err) {
      console.error('Error generating lesson:', err)
    } finally {
      setGeneratingLesson(false)
    }
  }

  const handleGenerateLessonCards = async () => {
    setGeneratingLessonCards(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) return

      const response = await fetch(`/api/mcq/${mcqSetId}/generate-lesson-cards`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      const data = await response.json()
      
      if (response.ok) {
        const questionsResponse = await fetch(`/api/mcq/${mcqSetId}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })
        
        if (questionsResponse.ok) {
          const questionsData = await questionsResponse.json()
          setQuestions(questionsData.questions || [])
          setMcqSet(questionsData.set)
        }
        
        alert(`Generated ${data.cardsGenerated} lesson cards!`)
      } else {
        console.error('Failed to generate lesson cards:', data.error)
        alert('Failed to generate lesson cards: ' + data.error)
      }
    } catch (err) {
      console.error('Error generating lesson cards:', err)
    } finally {
      setGeneratingLessonCards(false)
    }
  }

  const handleAutoCorrect = async () => {
    setAutoCorrecting(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) return

      const response = await fetch(`/api/mcq/${mcqSetId}/auto-correct`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      const data = await response.json()
      
      if (response.ok) {
        const questionsResponse = await fetch(`/api/mcq/${mcqSetId}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })
        
        if (questionsResponse.ok) {
          const questionsData = await questionsResponse.json()
          setQuestions(questionsData.questions || [])
          setMcqSet(questionsData.set)
        }
        
        alert(data.message)
      } else {
        console.error('Failed to auto-correct:', data.error)
        alert('Failed to auto-correct: ' + data.error)
      }
    } catch (err) {
      console.error('Error auto-correcting:', err)
    } finally {
      setAutoCorrecting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  if (error || !mcqSet) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="border border-border p-8 text-center max-w-md">
          <p className="text-text-primary font-medium mb-2">Error</p>
          <p className="text-text-secondary mb-6">{error || 'MCQ set not found'}</p>
          <Link href="/mcq" className="btn-primary inline-flex">
            Back to Quizzes
          </Link>
        </div>
      </div>
    )
  }

  const hasLessonCards = questions.some(q => q.lesson_card)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/mcq" className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
                <FiArrowLeft className="w-4 h-4" strokeWidth={1.5} />
              </Link>
            <div>
                <h1 className="text-lg font-medium text-text-primary">{mcqSet.name}</h1>
                <p className="text-xs text-text-tertiary mono flex items-center gap-2">
                  <span>{mcqSet.total_questions} questions</span>
                  <span>·</span>
                  <span>{mcqSet.total_pages} pages</span>
                {mcqSet.is_corrected && (
                    <>
                      <span>·</span>
                      <span className="text-success flex items-center gap-1">
                        <FiCheck className="w-3 h-3" strokeWidth={2} />
                    Corrected
                  </span>
                    </>
                )}
                {hasLessonCards && (
                    <>
                      <span>·</span>
                      <span className="text-mode-study flex items-center gap-1">
                        <FiBook className="w-3 h-3" strokeWidth={2} />
                        Lesson Cards
                  </span>
                    </>
                )}
              </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* Auto-Correct Button */}
              {!mcqSet.is_corrected && questions.length > 0 && (
                <button
                  onClick={handleAutoCorrect}
                  disabled={autoCorrecting}
                  className="btn-secondary text-xs"
                >
                  {autoCorrecting ? (
                    <><div className="spinner spinner-sm" /> Correcting...</>
                  ) : (
                    <><FiCheck className="w-4 h-4" strokeWidth={1.5} /> Auto-Correct</>
                  )}
                </button>
              )}

              {/* Generate Lesson Cards Button */}
              {!hasLessonCards && questions.length > 0 && (
                <button
                  onClick={handleGenerateLessonCards}
                  disabled={generatingLessonCards}
                  className="btn-mode-study text-xs"
                >
                  {generatingLessonCards ? (
                    <><div className="spinner spinner-sm" /> Generating...</>
                  ) : (
                    <><FiZap className="w-4 h-4" strokeWidth={1.5} /> Lesson Cards</>
                  )}
                </button>
              )}

              {/* Generate Section Lesson Button */}
              {!lesson && questions.length > 0 && (
                <button
                  onClick={handleGenerateLesson}
                  disabled={generatingLesson}
                  className="btn-secondary text-xs"
                >
                  {generatingLesson ? (
                    <><div className="spinner spinner-sm" /> Generating...</>
                  ) : (
                    <><FiBook className="w-4 h-4" strokeWidth={1.5} /> Generate Lesson</>
                  )}
                </button>
              )}
              
              <Link href={`/mcq/${mcqSetId}/edit`} className="btn-secondary text-xs">
                <FiEdit2 className="w-4 h-4" strokeWidth={1.5} />
                Edit
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="p-8">
        <div className="max-w-7xl mx-auto">
          {sessionId && activeSessionQuestionIds && (
            <div className="mb-4 p-3 border border-border rounded bg-surface flex items-center justify-between">
              <p className="text-sm text-text-secondary">
                Studying a selection of{' '}
                <span className="font-medium text-text-primary">{activeSessionQuestionIds.length}</span> questions.
              </p>
              <Link href={`/mcq/${mcqSetId}`} className="btn-secondary text-xs">
                Clear selection
              </Link>
            </div>
          )}
          {questions.length > 0 ? (
            <MCQViewer
              questions={questions}
              lesson={lesson}
              mcqSetId={sessionId ? `${mcqSetId}:${sessionId}` : mcqSetId}
              initialMode={sessionId ? 'study' : undefined}
            />
          ) : (
            <div className="border border-border p-8 text-center">
              <p className="text-text-secondary">No questions found in this set.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
