'use client'

import { useState, useCallback, useEffect } from 'react'
import { FiLoader, FiCheckCircle, FiAlertCircle, FiFile, FiImage, FiCpu, FiList, FiHelpCircle } from 'react-icons/fi'
import { useDocumentProcessor, LessonFileInput } from '@/hooks/useDocumentProcessor'

interface DocumentProcessorUIProps {
  lessonId: string
  files: LessonFileInput[]
  language: string
  onComplete: () => void
  onError: (error: string) => void
}

const STEPS = [
  { key: 'converting', label: 'Conversion PDF → Images', icon: FiImage, description: 'Transformation des pages en images...' },
  { key: 'uploading', label: 'Envoi des images', icon: FiFile, description: 'Upload vers le serveur...' },
  { key: 'transcribing', label: 'Transcription IA', icon: FiCpu, description: 'Analyse par GPT-4o-mini...' },
  { key: 'analyzing', label: 'Analyse de la structure', icon: FiList, description: 'Création des checkpoints...' },
  { key: 'complete', label: 'Terminé', icon: FiCheckCircle, description: 'Leçon prête !' },
]

export default function DocumentProcessorUI({
  lessonId,
  files,
  language,
  onComplete,
  onError
}: DocumentProcessorUIProps) {
  const { state, processDocument } = useDocumentProcessor()
  const [started, setStarted] = useState(false)
  
  const startProcessing = useCallback(async () => {
    if (started || !files.length) return
    setStarted(true)
    
    try {
      await processDocument(files, lessonId, language)
      onComplete()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Processing failed')
    }
  }, [files, lessonId, language, processDocument, onComplete, onError, started])
  
  // Auto-start when component mounts or files change
  useEffect(() => {
    startProcessing()
  }, [startProcessing])
  
  const currentStepIndex = STEPS.findIndex(s => s.key === state.status)
  
  return (
    <div className="bg-bg-secondary rounded-lg p-6 border border-border">
      <h2 className="text-xl font-semibold text-text-primary mb-6">
        Traitement du document
      </h2>
      
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-secondary">{state.message}</span>
          <span className="text-sm font-medium text-accent">{state.progress}%</span>
        </div>
        <div className="h-3 bg-bg-tertiary rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-accent to-accent-secondary transition-all duration-500 ease-out"
            style={{ width: `${state.progress}%` }}
          />
        </div>
        {state.currentPage && state.totalPages && (
          <div className="text-xs text-text-tertiary mt-1">
            Page {state.currentPage} / {state.totalPages}
          </div>
        )}
      </div>
      
      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step, index) => {
          const Icon = step.icon
          const isActive = state.status === step.key
          const isComplete = currentStepIndex > index || state.status === 'complete'
          const isError = state.status === 'error' && isActive
          
          return (
            <div 
              key={step.key}
              className={`flex items-center gap-4 p-3 rounded-lg transition-all ${
                isActive ? 'bg-accent/10 border border-accent/30' :
                isComplete ? 'bg-success/10 border border-success/30' :
                isError ? 'bg-error/10 border border-error/30' :
                'bg-bg-tertiary/50 border border-transparent'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isActive ? 'bg-accent text-white' :
                isComplete ? 'bg-success text-white' :
                isError ? 'bg-error text-white' :
                'bg-bg-tertiary text-text-tertiary'
              }`}>
                {isActive && state.status !== 'complete' && state.status !== 'error' ? (
                  <FiLoader className="w-5 h-5 animate-spin" />
                ) : isError ? (
                  <FiAlertCircle className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>
              
              <div className="flex-1">
                <div className={`font-medium ${
                  isActive || isComplete ? 'text-text-primary' : 'text-text-tertiary'
                }`}>
                  {step.label}
                </div>
                <div className={`text-sm ${
                  isActive ? 'text-text-secondary' : 'text-text-tertiary'
                }`}>
                  {isActive ? state.message : step.description}
                </div>
              </div>
              
              {isComplete && (
                <FiCheckCircle className="w-5 h-5 text-success" />
              )}
            </div>
          )
        })}
      </div>
      
      {/* Error message */}
      {state.status === 'error' && (
        <div className="mt-4 p-4 bg-error/10 border border-error/30 rounded-lg">
          <div className="flex items-center gap-2 text-error">
            <FiAlertCircle className="w-5 h-5" />
            <span className="font-medium">Erreur</span>
          </div>
          <p className="text-sm text-text-secondary mt-1">{state.message}</p>
        </div>
      )}
    </div>
  )
}

