/**
 * PDF to PNG Conversion
 * 
 * Converts a PDF document stored in Supabase into individual PNG page images.
 * Uses pdf-to-png-converter for the conversion.
 */

import { pdfToPng } from 'pdf-to-png-converter'
import { getSupabaseServerClient } from '@/lib/supabaseServer'

interface PageConversionResult {
  pageNumber: number
  storagePath: string
}

/**
 * Converts a PDF document to PNG images for each page.
 * 
 * @param documentId - The UUID of the document in the documents table
 * @returns Array of page numbers and their storage paths
 */
export async function convertPdfToPngPagesForDocument(
  documentId: string
): Promise<PageConversionResult[]> {
  console.log(`[PDF2PNG] Starting conversion for document: ${documentId}`)
  
  const supabase = getSupabaseServerClient()
  
  // 1. Get the document record
  const { data: document, error: docError } = await (supabase as any)
    .from('documents')
    .select('original_file_path')
    .eq('id', documentId)
    .single()
  
  if (docError || !document) {
    throw new Error(`Document not found: ${documentId}. Error: ${docError?.message}`)
  }
  
  const originalFilePath = document.original_file_path as string
  console.log(`[PDF2PNG] Original file path: ${originalFilePath}`)
  
  // 2. Download the PDF from Supabase Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('documents')
    .download(originalFilePath)
  
  if (downloadError || !fileData) {
    throw new Error(`Failed to download PDF: ${downloadError?.message}`)
  }
  
  console.log(`[PDF2PNG] Downloaded PDF: ${fileData.size} bytes`)
  
  // 3. Convert Blob to ArrayBuffer (required by pdf-to-png-converter)
  const arrayBuffer = await fileData.arrayBuffer()
  
  // 4. Convert PDF to PNG pages using pdf-to-png-converter
  console.log(`[PDF2PNG] Converting PDF to PNG pages...`)
  
  const pngPages = await pdfToPng(arrayBuffer, {
    viewportScale: 2.0,        // Good resolution for OCR
  })
  
  console.log(`[PDF2PNG] Converted ${pngPages.length} pages`)
  
  // 5. Upload each page image and create DB records
  const results: PageConversionResult[] = []
  
  for (const page of pngPages) {
    const pageNumber = page.pageNumber
    const content = page.content
    
    if (!content) {
      console.error(`[PDF2PNG] No content for page ${pageNumber}, skipping`)
      continue
    }
    
    const storagePath = `${documentId}/page-${pageNumber}.png`
    
    console.log(`[PDF2PNG] Uploading page ${pageNumber}: ${storagePath} (${content.length} bytes)`)
    
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('document-pages')
      .upload(storagePath, content, {
        contentType: 'image/png',
        upsert: true,
      })
    
    if (uploadError) {
      console.error(`[PDF2PNG] Failed to upload page ${pageNumber}:`, uploadError)
      throw new Error(`Failed to upload page ${pageNumber}: ${uploadError.message}`)
    }
    
    // Insert into document_pages table
    const { error: insertError } = await (supabase as any)
      .from('document_pages')
      .insert({
        document_id: documentId,
        page_number: pageNumber,
        image_path: storagePath,
        status: 'pending',
      })
    
    if (insertError) {
      console.error(`[PDF2PNG] Failed to insert page record ${pageNumber}:`, insertError)
      throw new Error(`Failed to insert page record ${pageNumber}: ${insertError.message}`)
    }
    
    results.push({ pageNumber, storagePath })
    console.log(`[PDF2PNG] ✓ Page ${pageNumber} processed`)
  }
  
  // Sort by page number
  results.sort((a, b) => a.pageNumber - b.pageNumber)
  
  console.log(`[PDF2PNG] ✓ Conversion complete: ${results.length} pages`)
  
  return results
}

export default convertPdfToPngPagesForDocument

