import { extractPdfText, convertPdfToImages } from '../pdf-to-images'
import { getOpenAI } from './openai-client'

/**
 * Extract text content from a PDF file (text-based, much faster)
 */
export async function extractTextFromPdf(
  pdfBuffer: Buffer,
  filename: string
): Promise<{ content: string; pageCount: number }> {
  console.log(`[PDF Extractor] Processing ${filename}...`)

  try {
    // First, try text-based extraction (fast and reliable)
    console.log('[PDF Extractor] Attempting text-based extraction...')
    const { text, numPages } = await extractPdfText(pdfBuffer)
    
    if (text && text.trim().length > 100) {
      // Text extraction successful
      console.log(`[PDF Extractor] ✅ Text extraction successful: ${text.length} chars, ${numPages} pages`)
      return {
        content: text,
        pageCount: numPages,
      }
    }
    
    console.log('[PDF Extractor] Text extraction returned minimal content, falling back to OCR...')
  } catch (textError: any) {
    console.error('[PDF Extractor] Text extraction failed:', textError.message)
    console.log('[PDF Extractor] Falling back to OCR extraction...')
  }

  // Fallback to image-based OCR extraction if text extraction fails
  return extractTextFromPdfWithOCR(pdfBuffer, filename)
}

/**
 * Extract text from PDF using OCR (GPT-4 Vision) - slower but works on scanned PDFs
 */
async function extractTextFromPdfWithOCR(
  pdfBuffer: Buffer,
  filename: string
): Promise<{ content: string; pageCount: number }> {
  console.log(`[PDF Extractor] Using OCR extraction for ${filename}...`)

  // Convert PDF to images
  const pageImages = await convertPdfToImages(pdfBuffer, 1.5)
  console.log(`[PDF Extractor] Converted to ${pageImages.length} images`)

  const openai = getOpenAI()
  const extractedPages: string[] = []

  // Extract text from each page using GPT-4 Vision
  for (let i = 0; i < pageImages.length; i++) {
    const pageImage = pageImages[i]
    console.log(`[PDF Extractor] Extracting page ${i + 1}/${pageImages.length}`)

    try {
      // Convert buffer to base64
      const base64Image = pageImage.buffer.toString('base64')
      const dataUrl = `data:image/png;base64,${base64Image}`

      // Use GPT-4 Vision to extract text
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

Return ONLY the extracted text, no commentary.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract all text from page ${i + 1} of ${filename}`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      })

      const extractedText = response.choices[0]?.message?.content || ''
      extractedPages.push(`\n\n--- Page ${i + 1} ---\n\n${extractedText}`)
      
      console.log(`[PDF Extractor] Page ${i + 1} extracted: ${extractedText.length} characters`)
    } catch (error) {
      console.error(`[PDF Extractor] Failed to extract page ${i + 1}:`, error)
      extractedPages.push(`\n\n--- Page ${i + 1} ---\n\n[Extraction failed]`)
    }
  }

  const fullContent = extractedPages.join('\n\n')
  
  console.log(`[PDF Extractor] Completed: ${fullContent.length} total characters`)

  return {
    content: fullContent,
    pageCount: pageImages.length,
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
