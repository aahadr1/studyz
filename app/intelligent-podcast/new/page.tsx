'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewPodcastPage() {
  const router = useRouter()
  const [documentIds, setDocumentIds] = useState<string[]>([])
  const [targetDuration, setTargetDuration] = useState(30)
  const [language, setLanguage] = useState('auto')
  const [style, setStyle] = useState('conversational')
  const [voiceProvider, setVoiceProvider] = useState('openai')
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (documentIds.length === 0) {
      setError('Please add at least one document')
      return
    }

    setIsGenerating(true)
    setError(null)
    setProgress(0)

    try {
      const response = await fetch('/api/intelligent-podcast/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentIds,
          targetDuration,
          language,
          style,
          voiceProvider,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate podcast')
      }

      const result = await response.json()
      
      // Redirect to podcast player
      router.push(`/intelligent-podcast/${result.id}`)
    } catch (err: any) {
      console.error('Generation error:', err)
      setError(err.message || 'Failed to generate podcast')
    } finally {
      setIsGenerating(false)
    }
  }

  const addDocumentId = () => {
    setDocumentIds([...documentIds, ''])
  }

  const updateDocumentId = (index: number, value: string) => {
    const updated = [...documentIds]
    updated[index] = value
    setDocumentIds(updated)
  }

  const removeDocumentId = (index: number) => {
    setDocumentIds(documentIds.filter((_, i) => i !== index))
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Create Intelligent Podcast</h1>
          <p className="text-gray-400">
            Transform your documents into an engaging, interactive multi-voice podcast
          </p>
        </div>

        {/* Generation form */}
        <div className="space-y-6">
          {/* Documents */}
          <div className="bg-gray-900 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-4">Source Documents</h3>
            <p className="text-gray-400 text-sm mb-4">
              Add document IDs or upload PDFs (for now, enter placeholder IDs)
            </p>
            
            <div className="space-y-3">
              {documentIds.map((id, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={id}
                    onChange={(e) => updateDocumentId(index, e.target.value)}
                    placeholder="Document ID or path"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => removeDocumentId(index)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
                  >
                    Remove
                  </button>
                </div>
              ))}
              
              <button
                onClick={addDocumentId}
                className="w-full py-3 border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-lg transition-colors"
              >
                + Add Document
              </button>
            </div>
          </div>

          {/* Configuration */}
          <div className="bg-gray-900 rounded-lg p-6 space-y-4">
            <h3 className="text-xl font-semibold mb-4">Podcast Configuration</h3>
            
            {/* Duration */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Target Duration: {targetDuration} minutes
              </label>
              <input
                type="range"
                min="10"
                max="60"
                step="5"
                value={targetDuration}
                onChange={(e) => setTargetDuration(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>10 min</span>
                <span>30 min</span>
                <span>60 min</span>
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium mb-2">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2"
              >
                <option value="auto">Auto-detect</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
              </select>
            </div>

            {/* Style */}
            <div>
              <label className="block text-sm font-medium mb-2">Conversation Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2"
              >
                <option value="educational">Educational</option>
                <option value="conversational">Conversational</option>
                <option value="technical">Technical</option>
                <option value="storytelling">Storytelling</option>
              </select>
            </div>

            {/* Voice Provider */}
            <div>
              <label className="block text-sm font-medium mb-2">Voice Quality</label>
              <select
                value={voiceProvider}
                onChange={(e) => setVoiceProvider(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2"
              >
                <option value="openai">OpenAI (Good quality, fast)</option>
                <option value="elevenlabs">ElevenLabs (Premium quality)</option>
                <option value="playht">PlayHT (High quality)</option>
              </select>
            </div>
          </div>

          {/* Features preview */}
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-3">✨ Intelligent Features</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>✅ <strong>3 distinct voices</strong> - Host, Expert, Simplifier</li>
              <li>✅ <strong>Knowledge Graph</strong> - Concepts and relationships mapped</li>
              <li>✅ <strong>Chapter navigation</strong> - Jump to any topic instantly</li>
              <li>✅ <strong>Interactive Q&A</strong> - Ask questions with voice (Realtime API)</li>
              <li>✅ <strong>Smart breakpoints</strong> - Optimal moments to pause</li>
              <li>✅ <strong>Predicted questions</strong> - Pre-answered common questions</li>
              <li>✅ <strong>Semantic search</strong> - Find any concept instantly</li>
            </ul>
          </div>

          {/* Error display */}
          {error && (
            <div className="bg-red-900/50 border border-red-600 rounded-lg p-4">
              <div className="font-semibold">Error</div>
              <div className="text-sm text-red-200">{error}</div>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || documentIds.length === 0}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed font-semibold text-lg rounded-lg transition-all"
          >
            {isGenerating ? 'Generating Podcast...' : '🎙️ Generate Intelligent Podcast'}
          </button>

          {/* Progress */}
          {isGenerating && (
            <div className="bg-gray-900 rounded-lg p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
              </div>
              <p className="text-center text-gray-400">
                This may take 2-5 minutes depending on content length...
              </p>
              <div className="mt-4 text-center text-sm text-gray-500">
                Analyzing documents → Building knowledge graph → Generating script → Creating audio
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
