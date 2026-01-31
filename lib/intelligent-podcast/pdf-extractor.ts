import { convertPdfToImages } from '../pdf-to-images'
import { getOpenAI } from './openai-client'

/**
 * Extract text content from a PDF using GPT-4 Vision (same as MCQ workflow)
 * This works for BOTH text-based and scanned/image PDFs
 */
export async function extractTextFromPdf(
  pdfBuffer: Buffer,
  filename: string
): Promise<{ content: string; pageCount: number }> {
  console.log(`[PDF Extractor] Processing ${filename} with GPT-4 Vision...`)

  try {
    // Convert PDF to images (same as your MCQ workflow)
    console.log('[PDF Extractor] Converting PDF to images...')
    const pageImages = await convertPdfToImages(pdfBuffer, 1.5)
    console.log(`[PDF Extractor] ✅ Converted to ${pageImages.length} images`)

    const openai = getOpenAI()
    const extractedPages: string[] = []

    // Extract text from each page using GPT-4 Vision (same approach as MCQ extraction)
    for (let i = 0; i < pageImages.length; i++) {
      const pageImage = pageImages[i]
      console.log(`[PDF Extractor] Extracting page ${i + 1}/${pageImages.length} with Vision API...`)

      try {
        // Convert buffer to base64 data URL
        const base64Image = pageImage.buffer.toString('base64')
        const dataUrl = `data:image/png;base64,${base64Image}`

        // Use GPT-4 Vision (same model as your MCQ workflow)
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are an expert at extracting text from document images.

Extract ALL text from this page in a clear, readable format.
Preserve:
- Headings and structure
- Paragraphs and formatting
- Lists and bullet points
- Important terms and concepts
- Technical content and formulas

Return ONLY the extracted text, no commentary.`
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: `Extract all text from page ${i + 1} of ${filename}` },
                { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
              ]
            }
          ],
          max_tokens: 4096,
          temperature: 0.1
        })

        const extractedText = response.choices[0]?.message?.content || ''
        extractedPages.push(`\n\n--- Page ${i + 1} ---\n\n${extractedText}`)
        
        console.log(`[PDF Extractor] ✅ Page ${i + 1} extracted: ${extractedText.length} characters`)
      } catch (pageError: any) {
        console.error(`[PDF Extractor] Failed to extract page ${i + 1}:`, pageError)
        extractedPages.push(`\n\n--- Page ${i + 1} ---\n\n[Extraction failed]`)
      }
    }

    const fullContent = extractedPages.join('\n\n')
    console.log(`[PDF Extractor] ✅ Completed: ${fullContent.length} total characters`)

    return {
      content: fullContent,
      pageCount: pageImages.length
    }
  } catch (error: any) {
    console.error('[PDF Extractor] Vision extraction failed:', error)
    throw new Error(`Failed to extract PDF: ${error.message}`)
  }
}


/**
 * Download PDF from URL and extract content
 */
export async function extractTextFromPdfUrl(
  url: string,
  filename: string
): Promise<{ content: string; pageCount: number }> {
  console.log(`[PDF Extractor] Downloading from URL: ${url}`)

  try {
    // Add timeout to fetch
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'StudyzPodcastGenerator/1.0',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type')
    console.log(`[PDF Extractor] Content-Type: ${contentType}`)

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    console.log(`[PDF Extractor] Downloaded ${buffer.length} bytes`)

    if (buffer.length === 0) {
      throw new Error('Downloaded file is empty')
    }

    return extractTextFromPdf(buffer, filename)
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('PDF download timed out after 30 seconds')
    }
    console.error(`[PDF Extractor] Download error:`, error)
    throw new Error(`Failed to download PDF: ${error.message}`)
  }
}
