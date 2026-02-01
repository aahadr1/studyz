// Fallback to image-based extraction if needed
let pdfjsLib: any = null
let createCanvas: any = null
let pdfParse: any = null

async function initPdfParse() {
  if (!pdfParse) {
    try {
      // Dynamic import for pdf-parse (CommonJS module)
      const pdfParseModule: any = await import('pdf-parse')
      pdfParse = pdfParseModule.default || pdfParseModule
      console.log('[PDF] pdf-parse initialized successfully')
    } catch (error: any) {
      console.error('[PDF] Failed to initialize pdf-parse:', error)
      throw new Error(`pdf-parse initialization failed: ${error.message}`)
    }
  }
  return pdfParse
}

async function initPdfJsForImages() {
  if (!pdfjsLib) {
    try {
      // Import canvas for image rendering
      const canvasModule = await import('canvas')
      createCanvas = canvasModule.createCanvas

      // pdfjs-dist expects DOMMatrix / Path2D in some runtimes (even in "legacy" build).
      // In Node, we polyfill these from node-canvas if available.
      const g: any = globalThis as any
      if (!g.DOMMatrix && (canvasModule as any).DOMMatrix) g.DOMMatrix = (canvasModule as any).DOMMatrix
      if (!g.DOMPoint && (canvasModule as any).DOMPoint) g.DOMPoint = (canvasModule as any).DOMPoint
      if (!g.DOMRect && (canvasModule as any).DOMRect) g.DOMRect = (canvasModule as any).DOMRect
      if (!g.Path2D && (canvasModule as any).Path2D) g.Path2D = (canvasModule as any).Path2D
      if (!g.ImageData && (canvasModule as any).ImageData) g.ImageData = (canvasModule as any).ImageData
      if (!g.Image && (canvasModule as any).Image) g.Image = (canvasModule as any).Image
      
      // Import pdfjs-dist for image rendering
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      pdfjsLib = pdfjs
      
      console.log('[PDF] PDF.js initialized for image rendering')
    } catch (error: any) {
      console.error('[PDF] Failed to initialize PDF.js:', error)
      throw new Error(`PDF.js initialization failed: ${error.message}`)
    }
  }
}

export interface PageImage {
  pageNumber: number
  buffer: Buffer
  width: number
  height: number
}

async function loadPdfDocumentForRendering(pdfBuffer: Buffer): Promise<any> {
  // Initialize PDF.js at runtime
  await initPdfJsForImages()

  // Validate buffer
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error('PDF buffer is empty')
  }

  // Check if it looks like a PDF (starts with %PDF-)
  const header = pdfBuffer.slice(0, 5).toString('ascii')
  if (!header.startsWith('%PDF-')) {
    console.error('[PDF] Invalid PDF header:', header)
    throw new Error('File does not appear to be a valid PDF (invalid header)')
  }

  // Load the PDF document
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      disableFontFace: true,
    })
    return await loadingTask.promise
  } catch (loadError: any) {
    console.error('[PDF] Failed to load PDF document:', loadError)
    throw new Error(`Failed to load PDF: ${loadError.message}`)
  }
}

/**
 * Render specific pages of a PDF to PNG buffers (server-side).
 * This is used for per-page processing (vision transcription) without rendering the whole PDF.
 */
export async function renderPdfPagesToImages(
  pdfBuffer: Buffer,
  pageNumbers: number[],
  scale: number = 1.5
): Promise<PageImage[]> {
  const uniquePages = Array.from(new Set((pageNumbers || []).map((n) => Math.round(Number(n))).filter((n) => n > 0)))
  if (uniquePages.length === 0) return []

  console.log(`[PDF] Rendering ${uniquePages.length} page(s): ${uniquePages.join(', ')}`)

  const pdfDoc = await loadPdfDocumentForRendering(pdfBuffer)
  const numPages = Number(pdfDoc?.numPages) || 0
  if (numPages <= 0) throw new Error('Failed to read PDF page count')

  const pageImages: PageImage[] = []

  for (const pageNum of uniquePages) {
    if (pageNum < 1 || pageNum > numPages) {
      throw new Error(`Requested page ${pageNum} is out of bounds (1-${numPages})`)
    }

    try {
      console.log(`[PDF] Rendering page ${pageNum}/${numPages}...`)
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d')

      await page.render({
        canvasContext: context,
        viewport,
      }).promise

      const buffer = canvas.toBuffer('image/png')
      pageImages.push({
        pageNumber: pageNum,
        buffer,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      })
    } catch (pageError: any) {
      console.error(`[PDF] Failed to render page ${pageNum}:`, pageError)
      throw new Error(`Failed to render page ${pageNum}: ${pageError.message}`)
    }
  }

  return pageImages
}

/**
 * Extract text content from PDF using pdf-parse (text-based extraction)
 * This is much faster and more reliable than image-based extraction
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<{ text: string; numPages: number }> {
  console.log('[PDF] Extracting text from PDF, buffer length:', pdfBuffer.length)
  
  // Validate buffer
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error('PDF buffer is empty')
  }

  // Check if it looks like a PDF (starts with %PDF-)
  const header = pdfBuffer.slice(0, 5).toString('ascii')
  if (!header.startsWith('%PDF-')) {
    console.error('[PDF] Invalid PDF header:', header)
    throw new Error('File does not appear to be a valid PDF (invalid header)')
  }

  try {
    // Initialize pdf-parse dynamically
    const parser = await initPdfParse()
    const data = await parser(pdfBuffer)
    
    console.log(`[PDF] Successfully extracted ${data.numpages} pages, ${data.text.length} characters`)
    
    return {
      text: data.text,
      numPages: data.numpages,
    }
  } catch (error: any) {
    console.error('[PDF] Text extraction failed:', error)
    throw new Error(`Failed to extract PDF text: ${error.message}`)
  }
}

/**
 * Convert a PDF buffer to an array of PNG image buffers (one per page)
 * Only used as fallback when text extraction fails
 * @param pdfBuffer - The PDF file as a Buffer
 * @param scale - Scale factor for rendering (default 1.5 for good quality)
 * @returns Array of page images with their buffers and dimensions
 */
export async function convertPdfToImages(
  pdfBuffer: Buffer,
  scale: number = 1.5
): Promise<PageImage[]> {
  console.log('[PDF] Converting PDF to images, buffer length:', pdfBuffer.length)

  const pdfDoc = await loadPdfDocumentForRendering(pdfBuffer)
  const numPages = Number(pdfDoc?.numPages) || 0
  if (numPages <= 0) throw new Error('Failed to read PDF page count')

  const pageImages: PageImage[] = []

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      console.log(`[PDF] Processing page ${pageNum}/${numPages}...`)
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d')

      await page.render({
        canvasContext: context,
        viewport,
      }).promise

      const buffer = canvas.toBuffer('image/png')
      pageImages.push({
        pageNumber: pageNum,
        buffer,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      })
      console.log(`[PDF] Page ${pageNum} converted successfully`)
    } catch (pageError: any) {
      console.error(`[PDF] Failed to process page ${pageNum}:`, pageError)
      throw new Error(`Failed to process page ${pageNum}: ${pageError.message}`)
    }
  }

  return pageImages
}

/**
 * Get the number of pages in a PDF using fast text-based parsing
 */
export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  // Prefer PDF.js (same engine we use for rendering) to avoid pdf-parse runtime issues.
  try {
    const pdfDoc = await loadPdfDocumentForRendering(pdfBuffer)
    const numPages = Number(pdfDoc?.numPages) || 0
    if (numPages > 0) return numPages
  } catch (error: any) {
    console.warn('[PDF] PDF.js page count failed (will fallback):', error?.message || error)
  }

  // Fallback: best-effort manual parsing (similar to older confirm-upload logic)
  try {
    const text = pdfBuffer.toString('binary')
    const countMatch = text.match(/\/Count\s+(\d+)/g)
    if (countMatch) {
      const counts = countMatch.map((m) => parseInt(m.replace('/Count', '').trim(), 10)).filter((n) => Number.isFinite(n))
      const maxCount = counts.length > 0 ? Math.max(...counts) : 0
      if (maxCount > 0) return maxCount
    }

    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g)
    if (pageMatches && pageMatches.length > 0) {
      return pageMatches.length
    }
  } catch (error: any) {
    console.error('[PDF] Manual page count fallback failed:', error?.message || error)
  }

  throw new Error('Failed to get PDF page count')
}

