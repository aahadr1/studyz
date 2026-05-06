'use client'

// Dynamic import of pdf.js only on client side
let pdfjsLib: any = null

async function getPdfJs() {
  if (!pdfjsLib && typeof window !== 'undefined') {
    pdfjsLib = await import('pdfjs-dist')
    // Use local worker from public directory to avoid CORS issues
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  }
  return pdfjsLib
}

export interface PageImageData {
  pageNumber: number
  dataUrl: string // base64 data URL
  width: number
  height: number
}

// Maximum size for a single page upload (3MB to stay under Vercel's 4.5MB limit with overhead)
const MAX_PAGE_SIZE_BYTES = 3 * 1024 * 1024

/**
 * Convert a PDF file to images on the client side using canvas
 * @param file - PDF File object
 * @param scale - Scale factor for rendering (default 1.5)
 * @param quality - JPEG quality 0-1 (default 0.8)
 * @returns Array of page images as base64 data URLs
 */
export async function convertPdfToImagesClient(
  file: File,
  scale: number = 1.5,
  quality: number = 0.8
): Promise<PageImageData[]> {
  const pdfjs = await getPdfJs()
  if (!pdfjs) {
    throw new Error('PDF.js not available')
  }

  const arrayBuffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)

  // Load PDF document
  const loadingTask = pdfjs.getDocument({ data: uint8Array })
  const pdfDoc = await loadingTask.promise
  const numPages = pdfDoc.numPages

  const pageImages: PageImageData[] = []

  // Process each page
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    let currentScale = scale
    let currentQuality = quality
    let dataUrl: string
    let attempts = 0
    const maxAttempts = 4

    // Try progressively lower quality/scale until the image fits
    while (attempts < maxAttempts) {
      const viewport = page.getViewport({ scale: currentScale })

      // Create canvas element
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      
      canvas.width = viewport.width
      canvas.height = viewport.height

      // Render PDF page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      }
      await page.render(renderContext as any).promise

      // Convert canvas to JPEG data URL (much smaller than PNG)
      dataUrl = canvas.toDataURL('image/jpeg', currentQuality)

      // Check size (base64 is ~33% larger than binary)
      const estimatedBytes = (dataUrl.length - 22) * 0.75
      
      if (estimatedBytes <= MAX_PAGE_SIZE_BYTES) {
        break
      }

      // Reduce quality first, then scale
      attempts++
      if (currentQuality > 0.5) {
        currentQuality -= 0.15
      } else {
        currentScale *= 0.8
        currentQuality = quality // Reset quality
      }
      
      console.log(`Page ${pageNum} too large (${(estimatedBytes / 1024 / 1024).toFixed(2)}MB), retrying with scale=${currentScale.toFixed(2)}, quality=${currentQuality.toFixed(2)}`)
    }

    const viewport = page.getViewport({ scale: currentScale })
    pageImages.push({
      pageNumber: pageNum,
      dataUrl: dataUrl!,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
    })
  }

  return pageImages
}

/**
 * Get page count from PDF file
 */
export async function getPdfPageCountClient(file: File): Promise<number> {
  const pdfjs = await getPdfJs()
  if (!pdfjs) {
    throw new Error('PDF.js not available')
  }

  const arrayBuffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  
  const loadingTask = pdfjs.getDocument({ data: uint8Array })
  const pdfDoc = await loadingTask.promise
  
  return pdfDoc.numPages
}

