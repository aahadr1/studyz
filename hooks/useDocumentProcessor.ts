'use client'

/**
 * Document Processor Hook
 * 
 * Orchestrates the complete document processing pipeline:
 * 1. Client-side PDF → Image conversion (using PDF.js)
 * 2. Server-side image transcription (using GPT-4o-mini)
 * 3. Server-side structure analysis and checkpoint creation
 */

import { useState, useCallback } from 'react'
import { convertPdfToImages, dataUrlToBase64 } from '@/lib/pdfToImages'

export interface ProcessingState {
  status: 'idle' | 'converting' | 'uploading' | 'transcribing' | 'analyzing' | 'complete' | 'error'
  progress: number
  message: string
  currentPage?: number
  totalPages?: number
}

export interface PageTranscription {
  pageNumber: number
  transcription: string
  imageDataUrl: string
  documentId: string
  documentName: string
}

export interface ProcessingResult {
  pages: PageTranscription[]
  fullText: string
}

export interface LessonFileInput {
  file: File
  documentId: string
  documentName: string
  order?: number
}

interface PageContext {
  documentId: string
  documentName: string
  documentOrder: number
  pageNumber: number
  dataUrl: string
  width: number
  height: number
}

export function useDocumentProcessor() {
  const [state, setState] = useState<ProcessingState>({
    status: 'idle',
    progress: 0,
    message: ''
  })

  const [result, setResult] = useState<ProcessingResult | null>(null)

  const updateState = useCallback((updates: Partial<ProcessingState>) => {
    setState(prev => ({ ...prev, ...updates }))
  }, [])

  const updateLessonProgress = useCallback(async (
    lessonId: string,
    payload: {
      step?: string
      message?: string
      percent?: number
      status?: 'processing' | 'ready' | 'error'
    }
  ) => {
    try {
      await fetch(`/api/interactive-lessons/${lessonId}/processing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } catch (error) {
      console.warn('[PROCESSOR] Failed to update lesson progress', error)
    }
  }, [])

  const processDocument = useCallback(async (
    files: LessonFileInput[],
    lessonId: string,
    language: string = 'fr'
  ): Promise<ProcessingResult> => {
    if (!files || files.length === 0) {
      throw new Error('Aucun document à traiter')
    }

    const pages: PageTranscription[] = []

    try {
      await updateLessonProgress(lessonId, {
        status: 'processing',
        step: 'converting',
        message: 'Préparation des documents...',
        percent: 0
      })

      // ========== PHASE 1: Convert all PDFs to Images ==========
      updateState({
        status: 'converting',
        progress: 0,
        message: 'Conversion des documents en images...',
        currentPage: 0,
        totalPages: 0
      })

      const allPages: PageContext[] = []
      const docOrderMap = new Map<string, number>()

      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const lessonFile = files[fileIndex]
        const docLabel = `${lessonFile.documentName || lessonFile.file.name}`

        console.log(`[PROCESSOR] Converting document ${fileIndex + 1}/${files.length}: ${docLabel}`)
        docOrderMap.set(lessonFile.documentId, fileIndex)

        const images = await convertPdfToImages(lessonFile.file, (progress) => {
          const percent = Math.round(((fileIndex + (progress.currentPage / Math.max(progress.totalPages, 1))) / files.length) * 30)
          updateState({
            status: 'converting',
            progress: percent,
            message: `Conversion ${docLabel} • Page ${progress.currentPage}/${progress.totalPages}`,
            currentPage: progress.currentPage,
            totalPages: progress.totalPages
          })
        })

        images.forEach(img => {
          allPages.push({
            documentId: lessonFile.documentId,
            documentName: docLabel,
            documentOrder: fileIndex,
            pageNumber: img.pageNumber,
            dataUrl: img.dataUrl,
            width: img.width,
            height: img.height
          })
        })
      }

      if (allPages.length === 0) {
        throw new Error('Impossible de convertir le PDF en images')
      }

      console.log(`[PROCESSOR] ✓ ${allPages.length} pages converties`)

      await updateLessonProgress(lessonId, {
        step: 'uploading',
        message: `Conversion terminée (${allPages.length} pages). Envoi des images...`,
        percent: 30
      })

      // ========== PHASE 2: Upload Images ==========
      updateState({
        status: 'uploading',
        progress: 30,
        message: 'Envoi des images...',
        totalPages: allPages.length
      })

      for (let i = 0; i < allPages.length; i++) {
        const page = allPages[i]
        const percent = 30 + Math.round((i / allPages.length) * 20)

        updateState({
          status: 'uploading',
          progress: percent,
          message: `Envoi ${page.documentName} • Page ${page.pageNumber}`,
          currentPage: page.pageNumber
        })

        const blob = await fetch(page.dataUrl).then(r => r.blob())
        const formData = new FormData()
        formData.append('file', blob, `${page.documentName}-page-${page.pageNumber}.png`)
        formData.append('pageNumber', String(page.pageNumber))
        formData.append('lessonId', lessonId)
        formData.append('documentId', page.documentId)
        formData.append('width', String(page.width))
        formData.append('height', String(page.height))

        await fetch(`/api/interactive-lessons/${lessonId}/upload-page`, {
          method: 'POST',
          body: formData
        })
      }

      await updateLessonProgress(lessonId, {
        step: 'transcribing',
        message: 'Transcription des pages...',
        percent: 50
      })

      // ========== PHASE 3: Transcription ==========
      updateState({
        status: 'transcribing',
        progress: 50,
        message: 'Transcription IA en cours...',
        totalPages: allPages.length
      })

      for (let i = 0; i < allPages.length; i++) {
        const page = allPages[i]
        const percent = 50 + Math.round((i / allPages.length) * 40)

        updateState({
          status: 'transcribing',
          progress: percent,
          message: `IA • ${page.documentName} page ${page.pageNumber}`,
          currentPage: page.pageNumber
        })

        const response = await fetch('/api/transcribe-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrlToBase64(page.dataUrl),
            pageNumber: page.pageNumber,
            language
          })
        })

        if (!response.ok) {
          throw new Error(`Transcription échouée pour ${page.documentName} p.${page.pageNumber}`)
        }

        const data = await response.json()

        pages.push({
          pageNumber: page.pageNumber,
          transcription: data.transcription,
          imageDataUrl: page.dataUrl,
          documentId: page.documentId,
          documentName: page.documentName
        })

        await fetch(`/api/interactive-lessons/${lessonId}/save-transcription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: page.documentId,
            pageNumber: page.pageNumber,
            transcription: data.transcription
          })
        })
      }

      await updateLessonProgress(lessonId, {
        step: 'analyzing',
        message: 'Analyse de la structure...',
        percent: 90
      })

      // ========== PHASE 4: Analyse & Questions ==========
      updateState({
        status: 'analyzing',
        progress: 90,
        message: 'Analyse de la structure...'
      })

      const fullText = pages
        .sort((a, b) => {
          if (a.documentId === b.documentId) {
            return a.pageNumber - b.pageNumber
          }
          const orderA = docOrderMap.get(a.documentId) ?? 0
          const orderB = docOrderMap.get(b.documentId) ?? 0
          return orderA - orderB
        })
        .map((p, idx) => `Document ${p.documentName} - Page ${p.pageNumber}\n------\n${p.transcription}`)
        .join('\n\n')

      await fetch(`/api/interactive-lessons/${lessonId}/analyze-structure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullText,
          totalPages: pages.length,
          language
        })
      })

      await updateLessonProgress(lessonId, {
        step: 'complete',
        message: 'Traitement terminé',
        percent: 100,
        status: 'ready'
      })

      updateState({
        status: 'complete',
        progress: 100,
        message: 'Traitement terminé !',
        totalPages: pages.length
      })

      const processingResult: ProcessingResult = { pages, fullText }
      setResult(processingResult)

      console.log(`[PROCESSOR] ✓ Complete! ${pages.length} pages processed`)

      return processingResult

    } catch (error) {
      console.error('[PROCESSOR] Error:', error)

      await updateLessonProgress(lessonId, {
        step: 'error',
        message: error instanceof Error ? error.message : 'Erreur de traitement',
        status: 'error'
      })

      updateState({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Erreur de traitement'
      })
      throw error
    }
  }, [updateLessonProgress, updateState])

  const reset = useCallback(() => {
    setState({ status: 'idle', progress: 0, message: '' })
    setResult(null)
  }, [])

  return {
    state,
    result,
    processDocument,
    reset
  }
}

