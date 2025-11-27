// Server-side PDF processing utilities
// This file is used in the API routes to convert PDF pages to images

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf'
import { createCanvas } from 'canvas'

// Configure PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.entry')

interface PDFProcessResult {
  pageImages: Buffer[]
  pageCount: number
}

export async function processPDFToImages(
  pdfBuffer: Buffer,
  scale: number = 2.0
): Promise<PDFProcessResult> {
  try {
    const loadingTask = pdfjs.getDocument({ data: pdfBuffer })
    const pdfDoc = await loadingTask.promise
    const pageCount = pdfDoc.numPages
    const pageImages: Buffer[] = []

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d')

      await page.render({
        canvasContext: context as any,
        viewport: viewport,
      }).promise

      // Convert canvas to PNG buffer
      const imageBuffer = canvas.toBuffer('image/png')
      pageImages.push(imageBuffer)
    }

    return {
      pageImages,
      pageCount,
    }
  } catch (error) {
    console.error('Error processing PDF:', error)
    throw error
  }
}

export function validatePDFBuffer(buffer: Buffer): boolean {
  // Check if buffer starts with PDF signature
  const signature = buffer.slice(0, 4).toString()
  return signature === '%PDF'
}

