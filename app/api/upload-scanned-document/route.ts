/**
 * Upload Scanned Document API Route
 * 
 * Handles the upload of scanned PDF documents and orchestrates the OCR pipeline:
 * 1. Saves the PDF to Supabase Storage
 * 2. Converts each page to PNG
 * 3. Runs OCR on each page using GPT-4o-mini vision
 * 4. Returns the full extracted text
 */

import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { convertPdfToPngPagesForDocument } from '@/lib/ocr/convertPdfToPngPages'
import { runOcrForDocument } from '@/lib/ocr/runOcrForDocument'

// Ensure Node.js runtime for Vercel
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for large documents

export async function POST(request: NextRequest) {
  console.log('[UPLOAD] Received upload request')
  
  try {
    // 1. Parse FormData and get the file
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    
    if (!file) {
      console.error('[UPLOAD] No file provided')
      return Response.json(
        { error: 'Missing file' },
        { status: 400 }
      )
    }
    
    // Validate file type
    if (!file.type.includes('pdf')) {
      console.error('[UPLOAD] Invalid file type:', file.type)
      return Response.json(
        { error: 'File must be a PDF' },
        { status: 400 }
      )
    }
    
    console.log(`[UPLOAD] File received: ${file.name}, size: ${file.size} bytes`)
    
    // 2. Generate document ID
    const documentId = randomUUID()
    console.log(`[UPLOAD] Generated document ID: ${documentId}`)
    
    // 3. Upload PDF to Supabase Storage
    const supabase = getSupabaseServerClient()
    const storagePath = `${documentId}/original.pdf`
    
    console.log(`[UPLOAD] Uploading to: documents/${storagePath}`)
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })
    
    if (uploadError) {
      console.error('[UPLOAD] Storage upload failed:', uploadError)
      return Response.json(
        { error: `Failed to upload file: ${uploadError.message}` },
        { status: 500 }
      )
    }
    
    console.log('[UPLOAD] ✓ PDF uploaded to storage')
    
    // 4. Create document record in database
    const { error: insertError } = await (supabase as any)
      .from('documents')
      .insert({
        id: documentId,
        original_file_path: storagePath,
        status: 'pending_ocr',
      })
    
    if (insertError) {
      console.error('[UPLOAD] Database insert failed:', insertError)
      // Try to clean up the uploaded file
      await supabase.storage.from('documents').remove([storagePath])
      return Response.json(
        { error: `Failed to create document record: ${insertError.message}` },
        { status: 500 }
      )
    }
    
    console.log('[UPLOAD] ✓ Document record created')
    
    // 5. Update status to processing
    await (supabase as any)
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId)
    
    // 6. Convert PDF to PNG pages
    console.log('[UPLOAD] Starting PDF to PNG conversion...')
    const pages = await convertPdfToPngPagesForDocument(documentId)
    console.log(`[UPLOAD] ✓ Converted ${pages.length} pages`)
    
    // 7. Run OCR on all pages
    console.log('[UPLOAD] Starting OCR processing...')
    const { fullText } = await runOcrForDocument(documentId)
    console.log(`[UPLOAD] ✓ OCR complete: ${fullText.length} chars`)
    
    // 8. Return success response
    return Response.json({
      documentId,
      fullText,
      pageCount: pages.length,
    })
    
  } catch (error) {
    console.error('[UPLOAD] Pipeline error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return Response.json(
      { error: `Pipeline failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}

