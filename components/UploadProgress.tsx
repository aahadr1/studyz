'use client'

import { useEffect, useState } from 'react'
import { FiCheck, FiLoader, FiUpload, FiImage } from 'react-icons/fi'

interface UploadProgressProps {
  files: File[]
  onComplete: () => void
}

interface FileProgress {
  name: string
  status: 'uploading' | 'processing' | 'completed' | 'error'
  progress: number
  error?: string
}

export default function UploadProgress({ files, onComplete }: UploadProgressProps) {
  const [filesProgress, setFilesProgress] = useState<FileProgress[]>([])

  useEffect(() => {
    // Initialize progress for all files
    const initialProgress = files.map(file => ({
      name: file.name,
      status: 'uploading' as const,
      progress: 0,
    }))
    setFilesProgress(initialProgress)
  }, [files])

  const updateProgress = (index: number, updates: Partial<FileProgress>) => {
    setFilesProgress(prev => {
      const newProgress = [...prev]
      newProgress[index] = { ...newProgress[index], ...updates }
      return newProgress
    })
  }

  useEffect(() => {
    // Check if all completed
    const allCompleted = filesProgress.every(f => f.status === 'completed' || f.status === 'error')
    if (allCompleted && filesProgress.length > 0) {
      setTimeout(() => onComplete(), 1000)
    }
  }, [filesProgress, onComplete])

  const getStatusIcon = (status: FileProgress['status']) => {
    switch (status) {
      case 'uploading':
        return <FiUpload className="w-5 h-5 text-blue-600 animate-pulse" />
      case 'processing':
        return <FiImage className="w-5 h-5 text-purple-600 animate-pulse" />
      case 'completed':
        return <FiCheck className="w-5 h-5 text-green-600" />
      case 'error':
        return <span className="text-red-600 text-xl">✕</span>
      default:
        return <FiLoader className="w-5 h-5 animate-spin" />
    }
  }

  const getStatusText = (status: FileProgress['status']) => {
    switch (status) {
      case 'uploading':
        return 'Uploading...'
      case 'processing':
        return 'Converting pages to images...'
      case 'completed':
        return 'Ready!'
      case 'error':
        return 'Failed'
      default:
        return 'Pending'
    }
  }

  const getStatusColor = (status: FileProgress['status']) => {
    switch (status) {
      case 'uploading':
        return 'bg-blue-100 border-blue-200'
      case 'processing':
        return 'bg-purple-100 border-purple-200'
      case 'completed':
        return 'bg-green-100 border-green-200'
      case 'error':
        return 'bg-red-100 border-red-200'
      default:
        return 'bg-gray-100 border-gray-200'
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-2xl font-bold text-gray-900">Processing Documents</h2>
          <p className="text-sm text-gray-600 mt-1">
            {filesProgress.filter(f => f.status === 'completed').length} of {filesProgress.length} completed
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filesProgress.map((file, index) => (
            <div
              key={index}
              className={`border rounded-xl p-4 transition-all ${getStatusColor(file.status)}`}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-1">
                  {getStatusIcon(file.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {file.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {getStatusText(file.status)}
                  </p>
                  {file.error && (
                    <p className="text-sm text-red-600 mt-1">{file.error}</p>
                  )}
                  
                  {/* Progress bar */}
                  {file.status !== 'completed' && file.status !== 'error' && (
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            file.status === 'uploading' ? 'bg-blue-600' : 'bg-purple-600'
                          }`}
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{file.progress}%</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filesProgress.every(f => f.status === 'completed' || f.status === 'error') && (
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
            <div className="flex items-center justify-center space-x-2 text-green-600">
              <FiCheck className="w-5 h-5" />
              <span className="font-semibold">All documents processed!</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

