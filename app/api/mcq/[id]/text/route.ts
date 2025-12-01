import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { getMcqExtractionPrompt } from '@/lib/prompts'

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
      .select('id, user_id')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    console.log(`Processing text chunk ${chunkIndex + 1}, length: ${text.length} chars`)

    // Call OpenAI to extract MCQs from text
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert educational content extraction specialist. Your task is to extract ALL multiple choice questions from the provided text.

## YOUR CORE RESPONSIBILITIES

1. **Complete Extraction**: Extract EVERY multiple choice question from the text. Do not skip any questions.

2. **Accurate Transcription**: Preserve the original wording of questions and options.

3. **Correct Answer Identification**: Identify the correct answer by looking for:
   - Explicit markings (asterisks, "correct:", etc.)
   - Answer keys
   - If no correct answer is marked, make your best educated guess based on subject matter expertise

4. **Explanation Generation**: Provide a clear explanation of WHY the correct answer is correct.

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
      "correctOption": "B",
      "explanation": "Detailed explanation of why B is correct."
    }
  ]
}

## IMPORTANT NOTES
- Handle various MCQ formats (A/B/C/D, 1/2/3/4, a/b/c/d, etc.)
- Questions may have 2-6 options
- True/False questions should be formatted as A) True, B) False
- If the text contains no MCQs, return {"questions": []}`
        },
        {
          role: 'user',
          content: `Extract ALL multiple choice questions from the following text:\n\n${text}`
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
    const questionRecords = questions.map((q: any) => ({
      mcq_set_id: mcqSetId,
      page_number: chunkIndex + 1, // Use chunk index as "page number"
      question: q.question,
      options: q.options,
      correct_option: q.correctOption,
      explanation: q.explanation,
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

