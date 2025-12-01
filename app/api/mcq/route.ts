import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { extractMcqsFromImage } from '@/lib/openai'

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

interface PageImageSubmission {
  pageNumber: number
  dataUrl: string
}

// POST /api/mcq - Create a new MCQ set with PDF images from client
export async function POST(request: NextRequest) {
  try {
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

    // Parse JSON body with page images
    const body = await request.json()
    const { name, sourcePdfName, pageImages } = body as {
      name?: string
      sourcePdfName: string
      pageImages: PageImageSubmission[]
    }

    if (!pageImages || !Array.isArray(pageImages) || pageImages.length === 0) {
      return NextResponse.json({ error: 'Page images are required' }, { status: 400 })
    }

    // Check page count limit (40 pages max for MCQ processing)
    const maxPages = 40
    if (pageImages.length > maxPages) {
      return NextResponse.json({
        error: `PDF has ${pageImages.length} pages, which exceeds the maximum limit of ${maxPages} pages`
      }, { status: 413 })
    }

    console.log(`Processing ${pageImages.length} pages from ${sourcePdfName}`)

    // Create the mcq_sets record first
    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .insert({
        user_id: user.id,
        name: name || sourcePdfName.replace('.pdf', ''),
        source_pdf_name: sourcePdfName,
        total_pages: pageImages.length,
      })
      .select()
      .single()

    if (setError || !mcqSet) {
      console.error('Error creating MCQ set:', setError)
      return NextResponse.json({ error: 'Failed to create MCQ set' }, { status: 500 })
    }

    // Process each page sequentially: upload image, extract MCQs, save questions
    const allQuestions: any[] = []
    let totalQuestionCount = 0

    for (const pageImageData of pageImages) {
      const { pageNumber, dataUrl } = pageImageData
      
      // Convert data URL to buffer
      const base64Data = dataUrl.split(',')[1]
      const imageBuffer = Buffer.from(base64Data, 'base64')
      
      const imagePath = `${user.id}/${mcqSet.id}/page-${pageNumber}.png`
      
      // Upload page image to storage
      const { error: imageUploadError } = await supabase.storage
        .from('mcq-pages')
        .upload(imagePath, imageBuffer, {
          contentType: 'image/png',
          upsert: true,
        })

      if (imageUploadError) {
        console.error(`Error uploading page ${pageNumber}:`, imageUploadError)
        continue
      }

      // Get public URL for the image
      const { data: { publicUrl } } = supabase.storage
        .from('mcq-pages')
        .getPublicUrl(imagePath)

      // Insert mcq_pages record
      const { data: pageRecord, error: pageError } = await supabase
        .from('mcq_pages')
        .insert({
          mcq_set_id: mcqSet.id,
          page_number: pageNumber,
          image_url: publicUrl,
          extracted_question_count: 0,
        })
        .select()
        .single()

      if (pageError) {
        console.error(`Error creating page record ${pageNumber}:`, pageError)
        continue
      }

      // Extract MCQs from the page image using GPT-4o-mini
      console.log(`Extracting MCQs from page ${pageNumber}...`)
      try {
        const extractedData = await extractMcqsFromImage(publicUrl)
        const questions = extractedData.questions || []

        if (questions.length > 0) {
          // Insert questions into database
          const questionRecords = questions.map((q) => ({
            mcq_set_id: mcqSet.id,
            page_number: pageNumber,
            question: q.question,
            options: q.options,
            correct_option: q.correctOption,
            explanation: q.explanation || null,
          }))

          const { data: insertedQuestions, error: questionsError } = await supabase
            .from('mcq_questions')
            .insert(questionRecords)
            .select()

          if (questionsError) {
            console.error(`Error inserting questions for page ${pageNumber}:`, questionsError)
          } else {
            allQuestions.push(...(insertedQuestions || []))
            totalQuestionCount += questions.length

            // Update page with question count
            await supabase
              .from('mcq_pages')
              .update({ extracted_question_count: questions.length })
              .eq('id', pageRecord.id)
          }
        }

        console.log(`Extracted ${questions.length} questions from page ${pageNumber}`)
      } catch (error) {
        console.error(`Error extracting MCQs from page ${pageNumber}:`, error)
        // Continue with next page
      }
    }

    // Update mcq_sets with total question count
    await supabase
      .from('mcq_sets')
      .update({ total_questions: totalQuestionCount })
      .eq('id', mcqSet.id)

    return NextResponse.json({ 
      set: {
        id: mcqSet.id,
        name: mcqSet.name,
        total_pages: mcqSet.total_pages,
        total_questions: totalQuestionCount,
      },
      questions: allQuestions,
      message: `Successfully extracted ${totalQuestionCount} questions from ${pageImages.length} pages`
    })
  } catch (error) {
    console.error('MCQ POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
