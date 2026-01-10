import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getAutoCorrectionPrompt, createAutoCorrectionUserPrompt } from '@/lib/prompts'
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

interface CorrectedQuestion {
  id: string
  wasModified: boolean
  modifications: string[]
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW'
  question: string
  options: Array<{ label: string; text: string }>
  questionType?: 'scq' | 'mcq'
  correctOptions?: string[]
  explanation: string
}

// POST /api/mcq/[id]/auto-correct - Auto-correct MCQ questions
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
      .select('id, question, options, question_type, correct_options, correct_option, explanation')
      .eq('mcq_set_id', mcqSetId)
      .order('page_number', { ascending: true })

    if (questionsError || !questions || questions.length === 0) {
      return NextResponse.json({ error: 'No questions found to correct' }, { status: 400 })
    }

    console.log(`Auto-correcting ${questions.length} questions in set "${mcqSet.name}"`)

    // Process in batches of 5 questions
    const batchSize = 5
    const allCorrectedQuestions: CorrectedQuestion[] = []
    let totalModified = 0
    let totalAnswersChanged = 0

    for (let i = 0; i < questions.length; i += batchSize) {
      const batch = questions.slice(i, i + batchSize)
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(questions.length / batchSize)}`)

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: getAutoCorrectionPrompt()
            },
            {
              role: 'user',
              content: createAutoCorrectionUserPrompt(batch)
            }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 8192,
          temperature: 0.3,
        })

        const content = response.choices[0]?.message?.content
        if (!content) continue

        const result = JSON.parse(content)
        const correctedQuestions = result.correctedQuestions || []

        const normalizeArr = (v: any): string[] => Array.isArray(v) ? v : []

        // Update each corrected question in the database
        for (const corrected of correctedQuestions) {
          const originalQuestion = batch.find(q => q.id === corrected.id)
          
          if (corrected.wasModified) {
            totalModified++
            
            // Check if the answer was changed
            if (originalQuestion) {
              const originalCorrectOptions =
                (Array.isArray(originalQuestion.correct_options) && originalQuestion.correct_options.length > 0)
                  ? originalQuestion.correct_options
                  : (originalQuestion.correct_option ? [originalQuestion.correct_option] : [])
              const newCorrectOptions = normalizeArr(corrected.correctOptions)
              const same =
                originalCorrectOptions.length === newCorrectOptions.length &&
                originalCorrectOptions.every((x: string) => newCorrectOptions.includes(x))
              if (!same) totalAnswersChanged++
            }

            // Update the question in database
            const originalCorrectOptionsForUpdate =
              (Array.isArray(originalQuestion?.correct_options) && originalQuestion!.correct_options.length > 0)
                ? originalQuestion!.correct_options
                : (originalQuestion?.correct_option ? [originalQuestion.correct_option] : [])
            const correctedCorrectOptions = normalizeArr(corrected.correctOptions)
            const finalCorrectOptions = correctedCorrectOptions.length > 0
              ? correctedCorrectOptions
              : originalCorrectOptionsForUpdate
            const correctedQuestionType: 'scq' | 'mcq' =
              corrected.questionType === 'mcq' || finalCorrectOptions.length > 1 ? 'mcq' : 'scq'
            const primaryCorrect = finalCorrectOptions[0] || (originalQuestion?.correct_option || 'A')

            await supabase
              .from('mcq_questions')
              .update({
                question: corrected.question,
                options: corrected.options,
                question_type: correctedQuestionType,
                correct_options: finalCorrectOptions,
                correct_option: primaryCorrect,
                explanation: corrected.explanation,
                is_corrected: true,
              })
              .eq('id', corrected.id)
          } else {
            // Mark as reviewed even if not modified
            await supabase
              .from('mcq_questions')
              .update({ is_corrected: true })
              .eq('id', corrected.id)
          }

          allCorrectedQuestions.push(corrected)
        }
      } catch (batchError) {
        console.error(`Error processing batch:`, batchError)
        // Continue with next batch
      }
    }

    // Mark the set as corrected
    await supabase
      .from('mcq_sets')
      .update({ is_corrected: true })
      .eq('id', mcqSetId)

    console.log(`Correction complete: ${totalModified} questions modified, ${totalAnswersChanged} answers changed`)

    return NextResponse.json({
      success: true,
      summary: {
        totalReviewed: questions.length,
        questionsModified: totalModified,
        answersChanged: totalAnswersChanged,
      },
      message: `Successfully reviewed ${questions.length} questions. Modified ${totalModified} questions, changed ${totalAnswersChanged} answers.`
    })
  } catch (error: any) {
    console.error('Auto-correction error:', error)
    return NextResponse.json({ 
      error: 'Failed to auto-correct questions',
      details: error?.message 
    }, { status: 500 })
  }
}

