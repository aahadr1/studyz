import { extractPdfText } from '../pdf-to-images'

/**
 * Extract text content from a PDF file (text-based only)
 * OCR fallback is disabled to avoid DOMMatrix issues
 */
export async function extractTextFromPdf(
  pdfBuffer: Buffer,
  filename: string
): Promise<{ content: string; pageCount: number }> {
  console.log(`[PDF Extractor] Processing ${filename}...`)

  try {
    // Try text-based extraction (fast and reliable)
    console.log('[PDF Extractor] Attempting text-based extraction...')
    const { text, numPages } = await extractPdfText(pdfBuffer)
    
    if (text && text.trim().length > 50) {
      // Text extraction successful
      console.log(`[PDF Extractor] ✅ Text extraction successful: ${text.length} chars, ${numPages} pages`)
      return {
        content: text,
        pageCount: numPages,
      }
    }
    
    console.error('[PDF Extractor] Text extraction returned minimal content')
    throw new Error('PDF appears to be scanned or empty. Please use a PDF with selectable text.')
  } catch (textError: any) {
    console.error('[PDF Extractor] Text extraction failed:', textError.message)
    throw new Error(`Failed to extract text from PDF: ${textError.message}. Please ensure the PDF has selectable text (not a scanned image).`)
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
