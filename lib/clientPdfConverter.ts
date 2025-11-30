/**
 * Client-side PDF to Image Converter
 * 
 * Uses pdfjs-dist to convert PDF pages to PNG images in the browser.
 * This avoids Vercel serverless limitations with native dependencies.
 */

import * as pdfjsLib from 'pdfjs-dist'

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
}

export interface PageConversionProgress {
  currentPage: number
  totalPages: number
  message: string
}

export interface ConversionResult {
  pageCount: number
  success: boolean
}

/**
 * Convert a PDF file to images and upload them to the server
 * 
 * @param file - The PDF file to convert
 * @param lessonId - The lesson ID to upload pages to
 * @param onProgress - Callback for progress updates
 * @returns Conversion result with page count
 */
export async function convertPdfAndUpload(
  file: File,
  lessonId: string,
  onProgress?: (progress: PageConversionProgress) => void
): Promise<ConversionResult> {
  // Load the PDF
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const totalPages = pdf.numPages

  onProgress?.({
    currentPage: 0,
    totalPages,
    message: `Conversion de ${totalPages} pages...`
  })

  // Process each page
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      currentPage: pageNum,
      totalPages,
      message: `Page ${pageNum} / ${totalPages}...`
    })

    // Get the page
    const page = await pdf.getPage(pageNum)
    
    // Set scale for good quality (2x for retina)
    const scale = 2.0
    const viewport = page.getViewport({ scale })

    // Create canvas
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    canvas.width = viewport.width
    canvas.height = viewport.height

    // Render page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!)
      }, 'image/png', 0.95)
    })

    // Upload the image
    const formData = new FormData()
    formData.append('pageNumber', pageNum.toString())
    formData.append('image', blob, `page-${pageNum}.png`)

    const response = await fetch(`/api/interactive-lessons/${lessonId}/upload-page-image`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || `Failed to upload page ${pageNum}`)
    }

    // Clean up
    canvas.remove()
  }

  onProgress?.({
    currentPage: totalPages,
    totalPages,
    message: 'Conversion terminée!'
  })

  return {
    pageCount: totalPages,
    success: true
  }
}

/**
 * Get the number of pages in a PDF file
 */
export async function getPdfPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  return pdf.numPages
}

