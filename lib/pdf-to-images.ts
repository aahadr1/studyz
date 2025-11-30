import { createCanvas } from 'canvas'
import * as pdfjsLib from 'pdfjs-dist'

// Configure PDF.js to use the worker
// @ts-ignore - pdfjs-dist types don't match the actual module structure
pdfjsLib.GlobalWorkerOptions.workerSrc = ''

// Custom canvas factory for Node.js environment
const canvasFactory = {
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
  // Load the PDF document
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    // @ts-ignore - canvasFactory type mismatch
    canvasFactory,
    useSystemFonts: true,
    standardFontDataUrl: undefined,
  })

  const pdfDoc = await loadingTask.promise
  const numPages = pdfDoc.numPages
  const pageImages: PageImage[] = []

  // Process each page
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
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
  }

  return pageImages
}

/**
 * Get the number of pages in a PDF
 */
export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
  })
  const pdfDoc = await loadingTask.promise
  return pdfDoc.numPages
}

