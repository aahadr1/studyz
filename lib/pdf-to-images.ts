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
  
  // Initialize PDF.js at runtime
  await initPdfJsForImages()
  console.log('[PDF] PDF.js initialized successfully')

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
  let pdfDoc: any
  try {
    console.log('[PDF] Creating getDocument task...')
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      disableFontFace: true,
    })

    console.log('[PDF] Waiting for PDF to load...')
    pdfDoc = await loadingTask.promise
    console.log('[PDF] PDF loaded successfully, pages:', pdfDoc.numPages)
  } catch (loadError: any) {
    console.error('[PDF] Failed to load PDF document:', loadError)
    throw new Error(`Failed to load PDF: ${loadError.message}`)
  }

  const numPages = pdfDoc.numPages
  const pageImages: PageImage[] = []

  // Process each page
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      console.log(`[PDF] Processing page ${pageNum}/${numPages}...`)
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      // Create canvas for this page
      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d')

      // Render the page to canvas
      await page.render({
        canvasContext: context,
        viewport,
      }).promise

      // Convert canvas to PNG buffer
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
  try {
    const parser = await initPdfParse()
    const data = await parser(pdfBuffer)
    return data.numpages
  } catch (error: any) {
    console.error('[PDF] Failed to get page count:', error)
    throw new Error(`Failed to get PDF page count: ${error.message}`)
  }
}

