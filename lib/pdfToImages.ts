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
  
  try {
    console.log('[PDF2IMG] Loading PDF.js library...')
    const module = await import('pdfjs-dist')
    
    if (typeof window !== 'undefined') {
      console.log('[PDF2IMG] Setting up worker...')
      // Use local worker file instead of CDN
      module.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
      console.log('[PDF2IMG] Worker source set to:', module.GlobalWorkerOptions.workerSrc)
    }
    
    pdfjsLib = module
    console.log('[PDF2IMG] PDF.js library loaded successfully')
    return pdfjsLib
  } catch (error) {
    console.error('[PDF2IMG] Failed to load PDF.js:', error)
    throw new Error(`Failed to load PDF.js library: ${error instanceof Error ? error.message : String(error)}`)
  }
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
    console.log('[PDF2IMG] Reading file as ArrayBuffer...')
    const arrayBuffer = await file.arrayBuffer()
    console.log(`[PDF2IMG] File read: ${arrayBuffer.byteLength} bytes`)
    
    // Load PDF document
    console.log('[PDF2IMG] Loading PDF.js...')
    const pdfjs = await getPdfJs()
    
    console.log('[PDF2IMG] Creating PDF document...')
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
    const pdf = await loadingTask.promise
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
    console.error('[PDF2IMG] Error details:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      name: error instanceof Error ? error.name : 'Unknown',
      toString: error?.toString ? error.toString() : String(error)
    })
    
    const errorMessage = error instanceof Error ? error.message : 
                        error?.toString ? error.toString() : 
                        'Unknown PDF conversion error'
    
    onProgress?.({
      currentPage: 0,
      totalPages: 0,
      status: 'error',
      message: `Erreur PDF: ${errorMessage}`
    })
    throw new Error(`PDF conversion failed: ${errorMessage}`)
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

