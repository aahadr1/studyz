import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { extractMcqsFromPageWindow } from '@/lib/openai'

export const runtime = 'nodejs'
export const maxDuration = 60
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

// POST /api/mcq/[id]/page - Upload a single page and extract MCQs
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mcqSetId } = await params
    const supabase = createServerClient()
    
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
      .select('id, user_id, total_pages, extraction_instructions, expected_total_questions, expected_options_per_question, expected_correct_options_per_question')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    // Parse JSON body with single page image
    const body = await request.json()
    const { pageNumber, dataUrl, prevDataUrl, nextDataUrl } = body as {
      pageNumber: number
      dataUrl: string
      prevDataUrl?: string | null
      nextDataUrl?: string | null
    }

    if (!pageNumber || !dataUrl) {
      return NextResponse.json({ error: 'pageNumber and dataUrl are required' }, { status: 400 })
    }

    console.log(`Processing page ${pageNumber} for MCQ set ${mcqSetId}`)

    // Convert data URL to buffer
    const base64Data = dataUrl.split(',')[1]
    const imageBuffer = Buffer.from(base64Data, 'base64')
    
    const imagePath = `${user.id}/${mcqSetId}/page-${pageNumber}.png`
    
    // Upload page image to storage
    const { error: imageUploadError } = await supabase.storage
      .from('mcq-pages')
      .upload(imagePath, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (imageUploadError) {
      console.error(`Error uploading page ${pageNumber}:`, imageUploadError)
      return NextResponse.json({ 
        error: 'Failed to upload page image',
        details: imageUploadError.message 
      }, { status: 500 })
    }

    // Get public URL for the image
    const { data: { publicUrl } } = supabase.storage
      .from('mcq-pages')
      .getPublicUrl(imagePath)

    const uploadNeighbor = async (neighborPageNumber: number, neighborDataUrl?: string | null) => {
      if (!neighborDataUrl) return null
      try {
        const b64 = neighborDataUrl.split(',')[1]
        const buf = Buffer.from(b64, 'base64')
        const path = `${user.id}/${mcqSetId}/page-${neighborPageNumber}.png`
        await supabase.storage.from('mcq-pages').upload(path, buf, {
          contentType: 'image/png',
          upsert: true,
        })
        const { data: { publicUrl: neighborUrl } } = supabase.storage.from('mcq-pages').getPublicUrl(path)
        return neighborUrl
      } catch (e) {
        return null
      }
    }

    const prevUrl = pageNumber > 1 ? await uploadNeighbor(pageNumber - 1, prevDataUrl) : null
    const nextUrl = await uploadNeighbor(pageNumber + 1, nextDataUrl)

    // Insert mcq_pages record
    const { data: pageRecord, error: pageError } = await supabase
      .from('mcq_pages')
      .insert({
        mcq_set_id: mcqSetId,
        page_number: pageNumber,
        image_url: publicUrl,
        extracted_question_count: 0,
      })
      .select()
      .single()

    if (pageError) {
      console.error(`Error creating page record ${pageNumber}:`, pageError)
      return NextResponse.json({ 
        error: 'Failed to create page record',
        details: pageError.message 
      }, { status: 500 })
    }

    // Extract MCQs from the page image (fast model with gpt-4o fallback)
    console.log(`Extracting MCQs from page ${pageNumber}...`)
    let questions: any[] = []
    let rawQuestionsCount = 0
    
    try {
      const pagesForWindow = [
        ...(prevUrl ? [{ pageNumber: pageNumber - 1, imageUrl: prevUrl }] : []),
        { pageNumber, imageUrl: publicUrl },
        ...(nextUrl ? [{ pageNumber: pageNumber + 1, imageUrl: nextUrl }] : []),
      ]

      const extractedData = await extractMcqsFromPageWindow(
        pagesForWindow,
        pageNumber,
        {
        extractionInstructions: mcqSet?.extraction_instructions || null,
        expectedTotalQuestions: mcqSet?.expected_total_questions ?? null,
        expectedOptionsPerQuestion: mcqSet?.expected_options_per_question ?? null,
        expectedCorrectOptionsPerQuestion: mcqSet?.expected_correct_options_per_question ?? null,
        pageNumber,
        totalPages: mcqSet?.total_pages ?? null,
        }
      )

      rawQuestionsCount = (extractedData.questions || []).length
      questions = (extractedData.questions || []).filter((q: any) => {
        const start = typeof q?.sourcePageStart === 'number' ? q.sourcePageStart : pageNumber
        return start === pageNumber
      })

      if (questions.length > 0) {
        // Insert questions into database
        const questionRecords = questions.map((q) => ({
          mcq_set_id: mcqSetId,
          page_number: pageNumber,
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

        const { error: questionsError } = await supabase
          .from('mcq_questions')
          .insert(questionRecords)

        if (questionsError) {
          console.error(`Error inserting questions for page ${pageNumber}:`, questionsError)
        }

        // Update page with question count
        await supabase
          .from('mcq_pages')
          .update({ extracted_question_count: questions.length })
          .eq('id', pageRecord.id)

        // Update total questions in mcq_sets
        const { data: currentSet } = await supabase
          .from('mcq_sets')
          .select('total_questions')
          .eq('id', mcqSetId)
          .single()

        await supabase
          .from('mcq_sets')
          .update({ total_questions: (currentSet?.total_questions || 0) + questions.length })
          .eq('id', mcqSetId)
      }

      console.log(`Extracted ${questions.length} questions from page ${pageNumber}`)
    } catch (error: any) {
      console.error(`Error extracting MCQs from page ${pageNumber}:`, error)
      // IMPORTANT: do not silently succeed, otherwise the UI shows "0 found" with no clue why.
      return NextResponse.json(
        {
          error: 'Failed to extract MCQs from page',
          details: error?.message,
          pageNumber,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      pageNumber,
      rawQuestionsCount,
      questionsExtracted: questions.length,
      questions: questions,
      message: `Page ${pageNumber} processed successfully`
    })
  } catch (error: any) {
    console.error('MCQ page POST error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error?.message
    }, { status: 500 })
  }
}

