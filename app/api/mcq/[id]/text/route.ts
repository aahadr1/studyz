import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

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

// POST /api/mcq/[id]/text - Extract MCQs from pasted text
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

    // Parse request body
    const { text, chunkIndex = 0 } = await request.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text content is required' }, { status: 400 })
    }

    // Verify MCQ set ownership
    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .select('id, user_id, total_pages, extraction_instructions, expected_total_questions, expected_options_per_question, expected_correct_options_per_question')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    console.log(`Processing text chunk ${chunkIndex + 1}, length: ${text.length} chars`)

    const constraintsLines: string[] = []
    if (typeof mcqSet?.expected_total_questions === 'number') {
      constraintsLines.push(`- Expected total questions in the document: ${mcqSet.expected_total_questions}.`)
    }
    if (typeof mcqSet?.expected_options_per_question === 'number') {
      constraintsLines.push(`- Expected options per question: ${mcqSet.expected_options_per_question} (do not drop any options).`)
    }
    if (typeof mcqSet?.expected_correct_options_per_question === 'number') {
      constraintsLines.push(`- Expected number of correct options per question (when MCQ): ${mcqSet.expected_correct_options_per_question}.`)
    }
    if (typeof mcqSet?.extraction_instructions === 'string' && mcqSet.extraction_instructions.trim()) {
      constraintsLines.push(`- Additional user instructions: ${mcqSet.extraction_instructions.trim()}`)
    }
    const constraintsBlock = constraintsLines.length > 0
      ? `\n\n### USER-PROVIDED CONSTRAINTS (MUST RESPECT)\n${constraintsLines.join('\n')}\n`
      : ''

    // Call OpenAI to extract MCQs from text
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert educational content extraction specialist.
Your task is to extract ALL questions from the provided text, supporting BOTH:
- SCQ (single correct answer)
- MCQ (multiple correct answers / select all that apply)

## YOUR CORE RESPONSIBILITIES

1. **Complete Extraction**: Extract EVERY question from the text. Do not skip any questions.

2. **Accurate Transcription**: Preserve the original wording of questions and options.

3. **Correct Answer Identification**: Identify the correct answer(s) by looking for:
   - Explicit markings (asterisks, "correct:", etc.)
   - Answer keys
   - If there IS any explicit correctness signal, you MUST follow it and you MUST NOT override it with your own knowledge.
   - Only if NOTHING is explicitly marked (no asterisks, no "correct/answer" label, and no answer key): make your best educated guess based on subject matter expertise

4. **Explanations**:
   - If the source includes an explanation, include it.
   - If no explanation is present, you may return an empty string. (Explanations can be generated later.)

5. **Options**:
   - Preserve the full set of options. Questions may have 2-10 options.
   - Do NOT drop options (e.g. if a question has 10 propositions, return all 10).
   - Normalize labels to A, B, C, ... (up to J for 10).

6. **SCQ vs MCQ**:
   - If question says "select all that apply", "choose X correct", or if the answer key lists multiple answers, set "questionType" to "mcq" and return multiple correctOptions.
   - Otherwise set "questionType" to "scq" and return a single correctOptions entry.

7. **ORDER (CRITICAL)**:
   - Return questions in the EXACT same order as they appear in the text (top-to-bottom).
   - Do NOT reorder questions or options.

## OUTPUT FORMAT

Return a JSON object with this exact structure:
{
  "questions": [
    {
      "question": "The complete question text",
      "options": [
        {"label": "A", "text": "First option"},
        {"label": "B", "text": "Second option"},
        {"label": "C", "text": "Third option"},
        {"label": "D", "text": "Fourth option"}
      ],
      "questionType": "scq",
      "correctOptions": ["B"],
      "explanation": ""
    }
  ]
}

## IMPORTANT NOTES
- Handle various formats (A/B/C/D, 1/2/3/4/.../10, a/b/c/d, etc.)
- True/False questions should be formatted as A) True, B) False
- If the text contains no questions, return {"questions": []}`
        },
        {
          role: 'user',
          content: `Extract ALL questions from the following text.${constraintsBlock}\n\n${text}`
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'Failed to extract MCQs' }, { status: 500 })
    }

    let extractedData
    try {
      extractedData = JSON.parse(content)
    } catch (e) {
      console.error('Failed to parse OpenAI response:', content)
      return NextResponse.json({ error: 'Failed to parse extracted MCQs' }, { status: 500 })
    }

    const questions = extractedData.questions || []
    console.log(`Extracted ${questions.length} questions from text chunk ${chunkIndex + 1}`)

    // Insert extracted questions into database
    const questionRecords = questions.map((q: any, idx: number) => ({
      mcq_set_id: mcqSetId,
      page_number: chunkIndex + 1, // Use chunk index as "page number"
      page_question_index: idx,
      question: q.question,
      options: q.options,
      question_type: q.questionType || ((q.correctOptions || []).length > 1 ? 'mcq' : 'scq'),
      correct_options: Array.isArray(q.correctOptions)
        ? q.correctOptions
        : (q.correctOption ? [q.correctOption] : []),
      correct_option: (Array.isArray(q.correctOptions) && q.correctOptions.length > 0)
        ? q.correctOptions[0]
        : (q.correctOption || 'A'),
      explanation: q.explanation || null,
    }))

    if (questionRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('mcq_questions')
        .insert(questionRecords)

      if (insertError) {
        console.error('Error inserting questions:', insertError)
        return NextResponse.json({ error: 'Failed to save questions' }, { status: 500 })
      }
    }

    // Update total questions count in mcq_sets
    const { data: currentSet } = await supabase
      .from('mcq_sets')
      .select('total_questions')
      .eq('id', mcqSetId)
      .single()

    const newTotal = (currentSet?.total_questions || 0) + questions.length

    await supabase
      .from('mcq_sets')
      .update({ 
        total_questions: newTotal,
        total_pages: chunkIndex + 1 
      })
      .eq('id', mcqSetId)

    return NextResponse.json({
      chunkIndex,
      extractedQuestionCount: questions.length,
      questions: questionRecords,
    })
  } catch (error: any) {
    console.error('Text extraction error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to extract MCQs from text' 
    }, { status: 500 })
  }
}

