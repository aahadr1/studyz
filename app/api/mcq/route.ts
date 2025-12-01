import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { convertPdfToImages } from '@/lib/pdf-to-images'
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

// POST /api/mcq - Create a new MCQ set with PDF upload
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

    // Parse form data
    const formData = await request.formData()
    const name = formData.get('name') as string
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    if (!file.type.includes('pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }

    // Check file size (50MB limit)
    const maxFileSize = 50 * 1024 * 1024 // 50MB in bytes
    if (file.size > maxFileSize) {
      return NextResponse.json({
        error: `File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds the maximum limit of 50MB`
      }, { status: 413 })
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)

    // Convert PDF to images
    console.log('Converting PDF to images...')
    let pageImages: any[] = []

    try {
      pageImages = await convertPdfToImages(pdfBuffer, 1.5)
      console.log(`Converted ${pageImages.length} pages`)

      // Check page count limit (40 pages max for MCQ processing)
      const maxPages = 40
      if (pageImages.length > maxPages) {
        return NextResponse.json({
          error: `PDF has ${pageImages.length} pages, which exceeds the maximum limit of ${maxPages} pages`
        }, { status: 413 })
      }
    } catch (error) {
      console.error('Error processing PDF:', error)
      return NextResponse.json({
        error: 'Failed to process PDF file. Please ensure it\'s a valid PDF document.'
      }, { status: 400 })
    }

    // Create the mcq_sets record first
    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .insert({
        user_id: user.id,
        name: name || file.name.replace('.pdf', ''),
        source_pdf_name: file.name,
        total_pages: pageImages.length,
      })
      .select()
      .single()

    if (setError || !mcqSet) {
      console.error('Error creating MCQ set:', setError)
      return NextResponse.json({ error: 'Failed to create MCQ set' }, { status: 500 })
    }

    // Upload original PDF to storage
    const pdfPath = `${user.id}/${mcqSet.id}/document.pdf`
    const { error: uploadError } = await supabase.storage
      .from('mcq-documents')
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Error uploading PDF:', uploadError)
      // Continue anyway - we have the images
    }

    // Get signed URL for the document
    const { data: signedUrlData } = await supabase.storage
      .from('mcq-documents')
      .createSignedUrl(pdfPath, 60 * 60 * 24 * 365) // 1 year

    if (signedUrlData) {
      await supabase
        .from('mcq_sets')
        .update({ document_url: signedUrlData.signedUrl })
        .eq('id', mcqSet.id)
    }

    // Process each page sequentially: upload image, extract MCQs, save questions
    const allQuestions: any[] = []
    let totalQuestionCount = 0

    for (const pageImage of pageImages) {
      const imagePath = `${user.id}/${mcqSet.id}/page-${pageImage.pageNumber}.png`
      
      // Upload page image
      const { error: imageUploadError } = await supabase.storage
        .from('mcq-pages')
        .upload(imagePath, pageImage.buffer, {
          contentType: 'image/png',
          upsert: true,
        })

      if (imageUploadError) {
        console.error(`Error uploading page ${pageImage.pageNumber}:`, imageUploadError)
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
          page_number: pageImage.pageNumber,
          image_url: publicUrl,
          extracted_question_count: 0,
        })
        .select()
        .single()

      if (pageError) {
        console.error(`Error creating page record ${pageImage.pageNumber}:`, pageError)
        continue
      }

      // Extract MCQs from the page image using GPT-4o-mini
      console.log(`Extracting MCQs from page ${pageImage.pageNumber}...`)
      try {
        const extractedData = await extractMcqsFromImage(publicUrl)
        const questions = extractedData.questions || []

        if (questions.length > 0) {
          // Insert questions into database
          const questionRecords = questions.map((q) => ({
            mcq_set_id: mcqSet.id,
            page_number: pageImage.pageNumber,
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
            console.error(`Error inserting questions for page ${pageImage.pageNumber}:`, questionsError)
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

        console.log(`Extracted ${questions.length} questions from page ${pageImage.pageNumber}`)
      } catch (error) {
        console.error(`Error extracting MCQs from page ${pageImage.pageNumber}:`, error)
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

