import { runGemini3Flash } from './gemini-client'

export interface PageImageInput {
  page_number: number
  url: string // data URL or image URL
}

/**
 * Extract text from pre-rendered page images using Gemini 3 Flash (Replicate).
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

  console.log(`[PDF Extractor] Transcribing ${documentName} (${pageImages.length} pages) with Gemini...`)

  const extractedBatches: string[] = []
  const batchSize = 10 // Gemini input constraint

  for (let i = 0; i < pageImages.length; i += batchSize) {
    const batch = pageImages.slice(i, i + batchSize)
    const pageNums = batch.map((p, idx) => p.page_number ?? i + idx + 1)
    console.log(`[PDF Extractor] Pages ${pageNums[0]}-${pageNums[pageNums.length - 1]}...`)

    const systemInstruction = `You are an expert at extracting text from document images.

Extract ALL text from each page image, in a clear, readable format.
Preserve headings, paragraphs, lists, and technical content (including formulas and symbols as text).

Output MUST be plain text only (no commentary).
For each page, you MUST wrap content like:
--- Page <N> ---
<extracted text>
`

    const prompt = `Document name: ${documentName}
Pages in this batch: ${pageNums.join(', ')}

Extract the text from each image and return them in order, using the exact delimiter format.
`

    try {
      const text = await runGemini3Flash({
        prompt,
        systemInstruction,
        images: batch.map((p) => p.url),
        thinkingLevel: 'low',
        temperature: 0.1,
        topP: 0.95,
        maxOutputTokens: 65535,
      })
      extractedBatches.push(text)
      console.log(`[PDF Extractor] ✅ Batch ${i / batchSize + 1}: ${text.length} chars`)
    } catch (err: any) {
      console.error(`[PDF Extractor] Batch ${i / batchSize + 1} failed:`, err.message)
      const fallback = pageNums.map((n) => `\n\n--- Page ${n} ---\n\n[Extraction failed]`).join('\n')
      extractedBatches.push(fallback)
    }
  }

  const content = extractedBatches.join('\n\n')
  console.log(`[PDF Extractor] ✅ ${documentName}: ${content.length} total chars`)

  return {
    content,
    pageCount: pageImages.length
  }
}
