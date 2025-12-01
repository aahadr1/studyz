'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase'
import { FiLoader, FiEdit2, FiBook, FiZap, FiCheckCircle } from 'react-icons/fi'
import Link from 'next/link'
import MCQViewer, { MCQQuestion, Lesson } from '@/components/MCQViewer'

export default function MCQSetPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mcqSet, setMcqSet] = useState<any>(null)
  const [questions, setQuestions] = useState<MCQQuestion[]>([])
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

        const response = await fetch(`/api/mcq/${resolvedParams.id}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Failed to load MCQ set')
        }

        const data = await response.json()
        setMcqSet(data.set)
        setQuestions(data.questions || [])
        setLesson(data.set.lesson_content || null)
      } catch (err: any) {
        console.error('Load error:', err)
        setError(err.message || 'Failed to load MCQ set')
      } finally {
        setIsLoading(false)
      }
    }

    loadMCQSet()
  }, [resolvedParams.id])

  const handleGenerateLesson = async () => {
    setGeneratingLesson(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) return

      const response = await fetch(`/api/mcq/${resolvedParams.id}/generate-lesson`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      const data = await response.json()
      
      if (response.ok && data.lesson) {
        setLesson(data.lesson)
        
        // Refetch questions to get updated section_ids
        const questionsResponse = await fetch(`/api/mcq/${resolvedParams.id}`, {
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

      const response = await fetch(`/api/mcq/${resolvedParams.id}/generate-lesson-cards`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      const data = await response.json()
      
      if (response.ok) {
        // Refetch to get updated questions with lesson cards
        const questionsResponse = await fetch(`/api/mcq/${resolvedParams.id}`, {
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

      const response = await fetch(`/api/mcq/${resolvedParams.id}/auto-correct`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      const data = await response.json()
      
      if (response.ok) {
        // Refetch to get corrected questions
        const questionsResponse = await fetch(`/api/mcq/${resolvedParams.id}`, {
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
        <div className="flex items-center gap-3 text-text-secondary">
          <FiLoader className="w-6 h-6 animate-spin" />
          <span>Loading MCQ set...</span>
        </div>
      </div>
    )
  }

  if (error || !mcqSet) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <p className="text-text-primary font-medium mb-2">Error</p>
          <p className="text-text-secondary mb-4">{error || 'MCQ set not found'}</p>
          <Link href="/mcq" className="btn-primary inline-flex">
            Back to MCQ Sets
          </Link>
        </div>
      </div>
    )
  }

  const hasLessonCards = questions.some(q => q.lesson_card)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-sidebar">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-text-primary">{mcqSet.name}</h1>
              <p className="text-sm text-text-secondary">
                {mcqSet.total_questions} question{mcqSet.total_questions !== 1 ? 's' : ''} · {mcqSet.total_pages} page{mcqSet.total_pages !== 1 ? 's' : ''}
                {mcqSet.is_corrected && (
                  <span className="ml-2 inline-flex items-center gap-1 text-green-600">
                    <FiCheckCircle className="w-3 h-3" />
                    Corrected
                  </span>
                )}
                {hasLessonCards && (
                  <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
                    <FiBook className="w-3 h-3" />
                    Has Lesson Cards
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* Auto-Correct Button */}
              {!mcqSet.is_corrected && questions.length > 0 && (
                <button
                  onClick={handleAutoCorrect}
                  disabled={autoCorrecting}
                  className="btn-secondary text-sm"
                  title="AI will verify and correct questions"
                >
                  {autoCorrecting ? (
                    <>
                      <FiLoader className="w-4 h-4 animate-spin" />
                      Correcting...
                    </>
                  ) : (
                    <>
                      <FiCheckCircle className="w-4 h-4" />
                      Auto-Correct
                    </>
                  )}
                </button>
              )}

              {/* Generate Lesson Cards Button */}
              {!hasLessonCards && questions.length > 0 && (
                <button
                  onClick={handleGenerateLessonCards}
                  disabled={generatingLessonCards}
                  className="btn-secondary text-sm"
                  title="Generate individual lesson cards for each question"
                >
                  {generatingLessonCards ? (
                    <>
                      <FiLoader className="w-4 h-4 animate-spin" />
                      Generating Cards...
                    </>
                  ) : (
                    <>
                      <FiZap className="w-4 h-4" />
                      Generate Lesson Cards
                    </>
                  )}
                </button>
              )}

              {/* Generate Section Lesson Button */}
              {!lesson && questions.length > 0 && (
                <button
                  onClick={handleGenerateLesson}
                  disabled={generatingLesson}
                  className="btn-secondary text-sm"
                >
                  {generatingLesson ? (
                    <>
                      <FiLoader className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FiBook className="w-4 h-4" />
                      Generate Lesson
                    </>
                  )}
                </button>
              )}
              
              <Link href={`/mcq/${resolvedParams.id}/edit`} className="btn-secondary text-sm">
                <FiEdit2 className="w-4 h-4" />
                Edit
              </Link>
              <Link href="/mcq" className="btn-secondary text-sm">
                All MCQ Sets
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="p-8">
        <div className="max-w-7xl mx-auto">
          {questions.length > 0 ? (
            <MCQViewer questions={questions} lesson={lesson} />
          ) : (
            <div className="card p-8 text-center">
              <p className="text-text-secondary">No questions found in this set.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
