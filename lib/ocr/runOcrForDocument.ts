/**
 * OCR Processing with GPT-4o-mini Vision
 * 
 * Processes all pages of a document through GPT-4o-mini vision model
 * to extract text from scanned document images.
 */

import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { openai } from '@/lib/openai'

interface OcrResult {
  fullText: string
}

/**
 * Runs OCR on all pages of a document using GPT-4o-mini vision.
 * 
 * @param documentId - The UUID of the document
 * @returns Object containing the full concatenated text
 */
export async function runOcrForDocument(
  documentId: string
): Promise<OcrResult> {
  console.log(`[OCR] Starting OCR for document: ${documentId}`)
  
  const supabase = getSupabaseServerClient()
  
  // 1. Get all pages for this document, ordered by page number
  const { data: pages, error: pagesError } = await (supabase as any)
    .from('document_pages')
    .select('*')
    .eq('document_id', documentId)
    .order('page_number', { ascending: true })
  
  if (pagesError) {
    throw new Error(`Failed to fetch pages: ${pagesError.message}`)
  }
  
  if (!pages || pages.length === 0) {
    throw new Error(`No pages found for document: ${documentId}`)
  }
  
  console.log(`[OCR] Found ${pages.length} pages to process`)
  
  // 2. Process each page
  const pageTexts: string[] = []
  
  for (const page of pages) {
    console.log(`[OCR] Processing page ${page.page_number}...`)
    
    // Update page status to processing
    await (supabase as any)
      .from('document_pages')
      .update({ status: 'processing' })
      .eq('id', page.id)
    
    try {
      // Get public URL for the image
      const { data: urlData } = supabase.storage
        .from('document-pages')
        .getPublicUrl(page.image_path)
      
      const publicUrl = urlData.publicUrl
      console.log(`[OCR] Image URL: ${publicUrl}`)
      
      // Call GPT-4o-mini vision API
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a strict OCR engine. You receive images of scanned document pages. ' +
              'You must output ONLY the exact text you see, preserving line breaks. ' +
              'Do not invent or correct anything. If a part is unreadable, output "[...]".',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Transcris exactement le texte de cette page de document scanné.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: publicUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
      })
      
      // Extract the text from the response
      const message = completion.choices[0]?.message
      let pageText = ''
      
      if (message?.content) {
        if (typeof message.content === 'string') {
          pageText = message.content
        } else if (Array.isArray(message.content)) {
          pageText = (message.content as any[])
            .map((part: any) => ('text' in part ? part.text : ''))
            .join('')
        }
      }
      
      console.log(`[OCR] Page ${page.page_number}: extracted ${pageText.length} chars`)
      
      // Update the page record with OCR text
      await (supabase as any)
        .from('document_pages')
        .update({
          ocr_text: pageText,
          status: 'done',
        })
        .eq('id', page.id)
      
      // Store for concatenation
      pageTexts.push(`Page ${page.page_number}\n------\n${pageText}`)
      
    } catch (error) {
      console.error(`[OCR] Error processing page ${page.page_number}:`, error)
      
      // Update page status to error
      await (supabase as any)
        .from('document_pages')
        .update({ status: 'error' })
        .eq('id', page.id)
      
      // Add error marker to page texts
      pageTexts.push(`Page ${page.page_number}\n------\n[ERROR: OCR failed for this page]`)
    }
  }
  
  // 3. Concatenate all page texts
  const fullText = pageTexts.join('\n\n')
  
  console.log(`[OCR] Full text assembled: ${fullText.length} chars`)
  
  // 4. Update the document record
  const { error: updateError } = await (supabase as any)
    .from('documents')
    .update({
      status: 'ocr_done',
      full_text: fullText,
    })
    .eq('id', documentId)
  
  if (updateError) {
    console.error(`[OCR] Failed to update document:`, updateError)
    throw new Error(`Failed to update document: ${updateError.message}`)
  }
  
  console.log(`[OCR] ✓ OCR complete for document: ${documentId}`)
  
  return { fullText }
}

export default runOcrForDocument

