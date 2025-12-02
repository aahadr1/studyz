// Dynamic imports to avoid build-time evaluation
let pdfjsLib: any = null
let createCanvas: any = null
let canvasFactory: any = null

async function initPdfJs() {
  if (!pdfjsLib) {
    try {
      // Dynamic import using the LEGACY build for Node.js environments
      // pdfjs-dist v5.x requires legacy build for Node.js (no DOMMatrix etc.)
      // @ts-ignore - dynamic import typing doesn't match the ESM export
      const pdfjsModule: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
      pdfjsLib = pdfjsModule.default || pdfjsModule
      
      console.log('pdfjs-dist (legacy) loaded, version:', pdfjsLib.version)

      // Configure PDF.js to use the legacy worker
      // Use import.meta.url to get a reliable path that works in both local and Vercel environments
      const url = await import('url')
      const path = await import('path')
      const currentDir = path.dirname(url.fileURLToPath(import.meta.url))
      const workerPath = path.resolve(currentDir, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
      // @ts-ignore - pdfjs-dist types don't match the actual module structure
      pdfjsLib.GlobalWorkerOptions.workerSrc = url.pathToFileURL(workerPath).href
      console.log('Worker configured:', workerPath)

      // Import canvas dynamically
      const canvasModule = await import('canvas')
      createCanvas = canvasModule.createCanvas
      console.log('canvas module loaded')

      // Custom canvas factory for Node.js environment
      canvasFactory = {
        create: (width: number, height: number) => {
          const canvas = createCanvas(width, height)
          return {
            canvas,
            context: canvas.getContext('2d'),
          }
        },
        reset: (canvasAndContext: { canvas: any; context: any }, width: number, height: number) => {
          canvasAndContext.canvas.width = width
          canvasAndContext.canvas.height = height
        },
        destroy: (canvasAndContext: { canvas: any; context: any }) => {
          canvasAndContext.canvas.width = 0
          canvasAndContext.canvas.height = 0
        },
      }
    } catch (initError: any) {
      console.error('Failed to initialize PDF.js:', initError)
      throw new Error(`PDF.js initialization failed: ${initError.message}`)
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
 * Convert a PDF buffer to an array of PNG image buffers (one per page)
 * @param pdfBuffer - The PDF file as a Buffer
 * @param scale - Scale factor for rendering (default 1.5 for good quality)
 * @returns Array of page images with their buffers and dimensions
 */
export async function convertPdfToImages(
  pdfBuffer: Buffer,
  scale: number = 1.5
): Promise<PageImage[]> {
  console.log('convertPdfToImages called, buffer length:', pdfBuffer.length)
  
  // Initialize PDF.js at runtime
  await initPdfJs()
  console.log('PDF.js initialized successfully')

  // Validate buffer
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error('PDF buffer is empty')
  }

  // Check if it looks like a PDF (starts with %PDF-)
  const header = pdfBuffer.slice(0, 5).toString('ascii')
  if (!header.startsWith('%PDF-')) {
    console.error('Invalid PDF header:', header)
    throw new Error('File does not appear to be a valid PDF (invalid header)')
  }

  // Load the PDF document
  let pdfDoc: any
  try {
    console.log('Creating getDocument task...')
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      // @ts-ignore - canvasFactory type mismatch
      canvasFactory,
      useSystemFonts: true,
      standardFontDataUrl: undefined,
      disableFontFace: true,
    })

    console.log('Waiting for PDF to load...')
    pdfDoc = await loadingTask.promise
    console.log('PDF loaded successfully, pages:', pdfDoc.numPages)
  } catch (loadError: any) {
    console.error('Failed to load PDF document:', loadError)
    throw new Error(`Failed to load PDF: ${loadError.message}`)
  }

  const numPages = pdfDoc.numPages
  const pageImages: PageImage[] = []

  // Process each page
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      console.log(`Processing page ${pageNum}/${numPages}...`)
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      // Create canvas for this page
      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d')

      // Render the page to canvas
      await page.render({
        // @ts-ignore - canvas context type mismatch between node-canvas and pdfjs
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
      console.log(`Page ${pageNum} converted successfully`)
    } catch (pageError: any) {
      console.error(`Failed to process page ${pageNum}:`, pageError)
      throw new Error(`Failed to process page ${pageNum}: ${pageError.message}`)
    }
  }

  return pageImages
}

/**
 * Get the number of pages in a PDF
 */
export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  // Initialize PDF.js at runtime
  await initPdfJs()

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
  })
  const pdfDoc = await loadingTask.promise
  return pdfDoc.numPages
}

