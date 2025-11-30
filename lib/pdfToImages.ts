'use client'

/**
 * PDF to Images Conversion - Client Side
 * 
 * Uses PDF.js to render PDF pages to canvas in the browser,
 * then converts them to PNG images.
 */

let pdfjsLib: typeof import('pdfjs-dist') | null = null

async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib
  const module = await import('pdfjs-dist')
  if (typeof window !== 'undefined') {
    module.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${module.version}/pdf.worker.min.js`
  }
  pdfjsLib = module
  return pdfjsLib
}

export interface PageImage {
  pageNumber: number
  dataUrl: string  // base64 PNG data URL
  width: number
  height: number
}

export interface ConversionProgress {
  currentPage: number
  totalPages: number
  status: 'loading' | 'converting' | 'done' | 'error'
  message: string
}

/**
 * Convert a PDF file to an array of PNG images (as data URLs)
 * This runs entirely in the browser using PDF.js
 */
export async function convertPdfToImages(
  file: File,
  onProgress?: (progress: ConversionProgress) => void,
  scale: number = 2.0  // Higher scale = better quality for OCR
): Promise<PageImage[]> {
  const images: PageImage[] = []
  
  try {
    // Report loading status
    onProgress?.({
      currentPage: 0,
      totalPages: 0,
      status: 'loading',
      message: 'Chargement du PDF...'
    })
    
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    
    // Load PDF document
    const pdfjs = await getPdfJs()
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
    const totalPages = pdf.numPages
    
    console.log(`[PDF2IMG] PDF loaded: ${totalPages} pages`)
    
    // Convert each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.({
        currentPage: pageNum,
        totalPages,
        status: 'converting',
        message: `Conversion page ${pageNum}/${totalPages}...`
      })
      
      console.log(`[PDF2IMG] Converting page ${pageNum}/${totalPages}`)
      
      // Get page
      const page = await pdf.getPage(pageNum)
      
      // Calculate dimensions
      const viewport = page.getViewport({ scale })
      
      // Create canvas
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      canvas.width = viewport.width
      canvas.height = viewport.height
      
      // Render page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        canvas: canvas
      }
      await page.render(renderContext as any).promise
      
      // Convert canvas to PNG data URL
      const dataUrl = canvas.toDataURL('image/png', 0.95)
      
      images.push({
        pageNumber: pageNum,
        dataUrl,
        width: viewport.width,
        height: viewport.height
      })
      
      console.log(`[PDF2IMG] ✓ Page ${pageNum} converted: ${viewport.width}x${viewport.height}`)
    }
    
    onProgress?.({
      currentPage: totalPages,
      totalPages,
      status: 'done',
      message: `${totalPages} pages converties`
    })
    
    return images
    
  } catch (error) {
    console.error('[PDF2IMG] Error:', error)
    onProgress?.({
      currentPage: 0,
      totalPages: 0,
      status: 'error',
      message: `Erreur: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
    throw error
  }
}

/**
 * Extract base64 data from a data URL
 */
export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] || ''
}

/**
 * Convert data URL to Blob for upload
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const byteString = atob(dataUrl.split(',')[1])
  const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0]
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i)
  }
  return new Blob([ab], { type: mimeString })
}

