import { getOpenAI } from './openai-client'

export interface PageImageInput {
  page_number: number
  url: string // data URL or image URL
}

/**
 * Extract text from pre-rendered page images using GPT-4 Vision only.
 * Same flow as MCQ extraction: client converts PDF to images, server only runs Vision.
 * No PDF.js / DOMMatrix on server - works in Node and edge.
 */
export async function extractTextFromPageImages(
  documentName: string,
  pageImages: PageImageInput[]
): Promise<{ content: string; pageCount: number }> {
  if (!pageImages || pageImages.length === 0) {
    throw new Error('No page images provided')
  }

  console.log(`[PDF Extractor] Transcribing ${documentName} (${pageImages.length} pages) with GPT-4 Vision...`)

  const openai = getOpenAI()
  const extractedPages: string[] = []

  for (let i = 0; i < pageImages.length; i++) {
    const page = pageImages[i]
    const pageNum = page.page_number ?? i + 1

    console.log(`[PDF Extractor] Page ${pageNum}/${pageImages.length}...`)

    try {
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
              { type: 'text', text: `Extract all text from page ${pageNum} of ${documentName}` },
              { type: 'image_url', image_url: { url: page.url, detail: 'high' } }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.1
      })

      const text = response.choices[0]?.message?.content || ''
      extractedPages.push(`\n\n--- Page ${pageNum} ---\n\n${text}`)
      console.log(`[PDF Extractor] ✅ Page ${pageNum}: ${text.length} chars`)
    } catch (err: any) {
      console.error(`[PDF Extractor] Page ${pageNum} failed:`, err.message)
      extractedPages.push(`\n\n--- Page ${pageNum} ---\n\n[Extraction failed]`)
    }
  }

  const content = extractedPages.join('\n\n')
  console.log(`[PDF Extractor] ✅ ${documentName}: ${content.length} total chars`)

  return {
    content,
    pageCount: pageImages.length
  }
}
