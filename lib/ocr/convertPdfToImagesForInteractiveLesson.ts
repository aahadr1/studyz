/**
 * PDF to PNG Conversion for Interactive Lessons
 * 
 * Converts a PDF document to individual PNG page images for interactive lessons.
 * Uses pdf-to-png-converter for the conversion.
 */

import { pdfToPng } from 'pdf-to-png-converter'
import { getSupabaseServerClient } from '@/lib/supabaseServer'

interface PageConversionResult {
  pageNumber: number
  storagePath: string
}

/**
 * Converts an interactive lesson PDF document to PNG images for each page.
 * 
 * @param documentId - The UUID of the document in interactive_lesson_documents table
 * @returns Array of page numbers and their storage paths
 */
export async function convertPdfToImagesForInteractiveLesson(
  documentId: string
): Promise<PageConversionResult[]> {
  console.log(`[PDF2IMG] Starting conversion for document: ${documentId}`)
  
  const supabase = getSupabaseServerClient()
  
  // 1. Get the document record
  const { data: document, error: docError } = await (supabase as any)
    .from('interactive_lesson_documents')
    .select('file_path, interactive_lesson_id')
    .eq('id', documentId)
    .single()
  
  if (docError || !document) {
    throw new Error(`Document not found: ${documentId}. Error: ${docError?.message}`)
  }
  
  const filePath = document.file_path as string
  console.log(`[PDF2IMG] File path: ${filePath}`)
  
  // 2. Download the PDF from Supabase Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('interactive-lessons')
    .download(filePath)
  
  if (downloadError || !fileData) {
    throw new Error(`Failed to download PDF: ${downloadError?.message}`)
  }
  
  console.log(`[PDF2IMG] Downloaded PDF: ${fileData.size} bytes`)
  
  // 3. Convert Blob to ArrayBuffer (required by pdf-to-png-converter)
  const arrayBuffer = await fileData.arrayBuffer()
  
  // 4. Convert PDF to PNG pages using pdf-to-png-converter
  console.log(`[PDF2IMG] Converting PDF to PNG pages...`)
  
  const pngPages = await pdfToPng(arrayBuffer, {
    viewportScale: 2.0,        // Good resolution for viewing and AI
  })
  
  console.log(`[PDF2IMG] Converted ${pngPages.length} pages`)
  
  // 5. Upload each page image and create DB records
  const results: PageConversionResult[] = []
  
  for (const page of pngPages) {
    const pageNumber = page.pageNumber
    const content = page.content
    
    if (!content) {
      console.error(`[PDF2IMG] No content for page ${pageNumber}, skipping`)
      continue
    }
    
    // Store images in: document_id/page-1.png, document_id/page-2.png, etc.
    const storagePath = `${documentId}/page-${pageNumber}.png`
    
    console.log(`[PDF2IMG] Uploading page ${pageNumber}: ${storagePath} (${content.length} bytes)`)
    
    // Upload to Supabase Storage in interactive-lesson-pages bucket
    const { error: uploadError } = await supabase.storage
      .from('interactive-lesson-pages')
      .upload(storagePath, content, {
        contentType: 'image/png',
        upsert: true,
      })
    
    if (uploadError) {
      console.error(`[PDF2IMG] Failed to upload page ${pageNumber}:`, uploadError)
      throw new Error(`Failed to upload page ${pageNumber}: ${uploadError.message}`)
    }
    
    // Insert into interactive_lesson_page_images table
    const { error: insertError } = await (supabase as any)
      .from('interactive_lesson_page_images')
      .insert({
        document_id: documentId,
        page_number: pageNumber,
        image_path: storagePath,
      })
      .select()
    
    if (insertError) {
      console.error(`[PDF2IMG] Failed to insert page record ${pageNumber}:`, insertError)
      throw new Error(`Failed to insert page record ${pageNumber}: ${insertError.message}`)
    }
    
    results.push({ pageNumber, storagePath })
    console.log(`[PDF2IMG] ✓ Page ${pageNumber} processed`)
  }
  
  // Sort by page number
  results.sort((a, b) => a.pageNumber - b.pageNumber)
  
  console.log(`[PDF2IMG] ✓ Conversion complete: ${results.length} pages`)
  
  return results
}

export default convertPdfToImagesForInteractiveLesson

