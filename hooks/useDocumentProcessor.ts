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
import { convertPdfToImages, dataUrlToBase64, PageImage } from '@/lib/pdfToImages'

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
}

export interface ProcessingResult {
  pages: PageTranscription[]
  fullText: string
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
  
  /**
   * Process a PDF document through the complete pipeline
   */
  const processDocument = useCallback(async (
    file: File,
    lessonId: string,
    language: string = 'fr'
  ): Promise<ProcessingResult> => {
    const pages: PageTranscription[] = []
    
    try {
      // ========== PHASE 1: Convert PDF to Images (Client-side) ==========
      updateState({
        status: 'converting',
        progress: 0,
        message: 'Conversion du PDF en images...'
      })
      
      console.log('[PROCESSOR] Starting PDF conversion...')
      
      const images = await convertPdfToImages(file, (progress) => {
        const percent = Math.round((progress.currentPage / Math.max(progress.totalPages, 1)) * 30)
        updateState({
          status: 'converting',
          progress: percent,
          message: progress.message,
          currentPage: progress.currentPage,
          totalPages: progress.totalPages
        })
      })
      
      console.log(`[PROCESSOR] ✓ Converted ${images.length} pages`)
      
      // ========== PHASE 2: Upload Images to Storage ==========
      updateState({
        status: 'uploading',
        progress: 30,
        message: 'Envoi des images...',
        totalPages: images.length
      })
      
      // Upload each image to Supabase storage
      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        const percent = 30 + Math.round((i / images.length) * 20)
        
        updateState({
          status: 'uploading',
          progress: percent,
          message: `Envoi page ${img.pageNumber}/${images.length}...`,
          currentPage: img.pageNumber
        })
        
        // Upload image to storage
        const blob = await fetch(img.dataUrl).then(r => r.blob())
        const formData = new FormData()
        formData.append('file', blob, `page-${img.pageNumber}.png`)
        formData.append('pageNumber', String(img.pageNumber))
        formData.append('lessonId', lessonId)
        
        await fetch(`/api/interactive-lessons/${lessonId}/upload-page`, {
          method: 'POST',
          body: formData
        })
        
        console.log(`[PROCESSOR] ✓ Uploaded page ${img.pageNumber}`)
      }
      
      // ========== PHASE 3: Transcribe Each Image with AI ==========
      updateState({
        status: 'transcribing',
        progress: 50,
        message: 'Transcription IA en cours...',
        totalPages: images.length
      })
      
      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        const percent = 50 + Math.round((i / images.length) * 40)
        
        updateState({
          status: 'transcribing',
          progress: percent,
          message: `Transcription IA page ${img.pageNumber}/${images.length}...`,
          currentPage: img.pageNumber
        })
        
        console.log(`[PROCESSOR] Transcribing page ${img.pageNumber}...`)
        
        // Send image to transcription API
        const response = await fetch('/api/transcribe-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrlToBase64(img.dataUrl),
            pageNumber: img.pageNumber,
            language
          })
        })
        
        if (!response.ok) {
          throw new Error(`Transcription failed for page ${img.pageNumber}`)
        }
        
        const data = await response.json()
        
        pages.push({
          pageNumber: img.pageNumber,
          transcription: data.transcription,
          imageDataUrl: img.dataUrl
        })
        
        console.log(`[PROCESSOR] ✓ Page ${img.pageNumber} transcribed: ${data.transcription.length} chars`)
        
        // Save transcription to database
        await fetch(`/api/interactive-lessons/${lessonId}/save-transcription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageNumber: img.pageNumber,
            transcription: data.transcription
          })
        })
      }
      
      // ========== PHASE 4: Analyze Structure and Create Checkpoints ==========
      updateState({
        status: 'analyzing',
        progress: 90,
        message: 'Analyse de la structure...'
      })
      
      // Combine all transcriptions
      const fullText = pages
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map(p => `Page ${p.pageNumber}\n------\n${p.transcription}`)
        .join('\n\n')
      
      // Call server to analyze structure and create checkpoints
      await fetch(`/api/interactive-lessons/${lessonId}/analyze-structure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullText,
          totalPages: pages.length,
          language
        })
      })
      
      // ========== COMPLETE ==========
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
      updateState({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Erreur de traitement'
      })
      throw error
    }
  }, [updateState])
  
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

