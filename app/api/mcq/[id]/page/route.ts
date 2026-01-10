import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { extractMcqsFromImage } from '@/lib/openai'

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
      .select('id, user_id')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    // Parse JSON body with single page image
    const body = await request.json()
    const { pageNumber, dataUrl } = body as {
      pageNumber: number
      dataUrl: string
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

    // Extract MCQs from the page image using GPT-4o-mini
    console.log(`Extracting MCQs from page ${pageNumber}...`)
    let questions: any[] = []
    
    try {
      const extractedData = await extractMcqsFromImage(publicUrl)
      questions = extractedData.questions || []

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
      // Continue - page is uploaded, just no questions extracted
    }

    return NextResponse.json({
      pageNumber,
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

