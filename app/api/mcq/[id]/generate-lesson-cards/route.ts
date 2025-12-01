import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getLessonCardPrompt, createLessonCardUserPrompt } from '@/lib/prompts'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Create a Supabase client with service role for server-side operations
function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

export interface LessonCard {
  questionId: string
  title: string
  conceptOverview: string
  detailedExplanation: string
  keyPoints: string[]
  example: string
  memoryHook: string
}

// POST /api/mcq/[id]/generate-lesson-cards - Generate individual lesson cards for each MCQ
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mcqSetId } = await params
    const supabase = createServerClient()
    const openai = getOpenAI()
    
    // Get user from auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify MCQ set ownership
    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .select('id, name, user_id')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    // Fetch all questions for this set
    const { data: questions, error: questionsError } = await supabase
      .from('mcq_questions')
      .select('id, question, options, correct_option, explanation')
      .eq('mcq_set_id', mcqSetId)
      .order('page_number', { ascending: true })

    if (questionsError || !questions || questions.length === 0) {
      return NextResponse.json({ error: 'No questions found to generate lesson cards for' }, { status: 400 })
    }

    console.log(`Generating lesson cards for ${questions.length} questions in set "${mcqSet.name}"`)

    // Process in batches of 5 questions for optimal quality
    const batchSize = 5
    const allLessonCards: LessonCard[] = []
    let successCount = 0

    for (let i = 0; i < questions.length; i += batchSize) {
      const batch = questions.slice(i, i + batchSize)
      console.log(`Processing lesson cards batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(questions.length / batchSize)}`)

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: getLessonCardPrompt()
            },
            {
              role: 'user',
              content: createLessonCardUserPrompt(batch)
            }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 8192,
          temperature: 0.7,
        })

        const content = response.choices[0]?.message?.content
        if (!content) continue

        const result = JSON.parse(content)
        const lessonCards = result.lessonCards || []

        // Update each question with its lesson card
        for (const card of lessonCards) {
          const question = batch.find(q => q.id === card.questionId)
          if (!question) continue

          // Store the lesson card in the database
          const { error: updateError } = await supabase
            .from('mcq_questions')
            .update({
              lesson_card: {
                title: card.title,
                conceptOverview: card.conceptOverview,
                detailedExplanation: card.detailedExplanation,
                keyPoints: card.keyPoints,
                example: card.example,
                memoryHook: card.memoryHook,
              }
            })
            .eq('id', card.questionId)

          if (!updateError) {
            successCount++
            allLessonCards.push(card)
          } else {
            console.error(`Error saving lesson card for question ${card.questionId}:`, updateError)
          }
        }
      } catch (batchError) {
        console.error(`Error processing batch:`, batchError)
        // Continue with next batch
      }
    }

    // Mark the set as having lesson cards
    await supabase
      .from('mcq_sets')
      .update({ has_lesson_cards: true })
      .eq('id', mcqSetId)

    console.log(`Lesson card generation complete: ${successCount}/${questions.length} cards created`)

    return NextResponse.json({
      success: true,
      totalQuestions: questions.length,
      cardsGenerated: successCount,
      lessonCards: allLessonCards,
      message: `Successfully generated ${successCount} lesson cards for ${questions.length} questions.`
    })
  } catch (error: any) {
    console.error('Lesson card generation error:', error)
    return NextResponse.json({ 
      error: 'Failed to generate lesson cards',
      details: error?.message 
    }, { status: 500 })
  }
}

