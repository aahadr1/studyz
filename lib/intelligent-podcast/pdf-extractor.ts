import { convertPdfToImages } from '../pdf-to-images'
import OpenAI from 'openai'

let openaiInstance: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

/**
 * Extract text content from a PDF file using OCR (GPT-4 Vision)
 */
export async function extractTextFromPdf(
  pdfBuffer: Buffer,
  filename: string
): Promise<{ content: string; pageCount: number }> {
  console.log(`[PDF Extractor] Processing ${filename}...`)

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

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  return extractTextFromPdf(buffer, filename)
}
