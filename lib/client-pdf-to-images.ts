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

/**
 * Convert a PDF file to images on the client side using canvas
 * @param file - PDF File object
 * @param scale - Scale factor for rendering (default 1.5)
 * @returns Array of page images as base64 data URLs
 */
export async function convertPdfToImagesClient(
  file: File,
  scale: number = 1.5
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
    const viewport = page.getViewport({ scale })

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

    // Convert canvas to data URL
    const dataUrl = canvas.toDataURL('image/png')

    pageImages.push({
      pageNumber: pageNum,
      dataUrl,
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

