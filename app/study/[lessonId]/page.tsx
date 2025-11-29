'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PageViewer from '@/components/PageViewer'

interface Doc {
  id: string
  name: string
}

export default function StudyPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  
  const lessonId = params.lessonId as string
  const docIds = searchParams.get('documents')?.split(',') || []

  const [docs, setDocs] = useState<Doc[]>([])
  const [currentDoc, setCurrentDoc] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (docIds.length === 0) {
      setLoading(false)
      return
    }

    const supabase = createClient()
    supabase
      .from('documents')
      .select('id, name')
      .in('id', docIds)
      .then(({ data }) => {
        setDocs(data || [])
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-neutral-900 text-white">Loading...</div>
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-white gap-4">
        <p>No documents selected</p>
        <button onClick={() => router.push(`/lessons/${lessonId}`)} className="px-4 py-2 bg-purple-600 rounded">
          Back to lesson
        </button>
      </div>
    )
  }

  const doc = docs[currentDoc]

  return (
    <div className="flex h-screen bg-neutral-900">
      {/* Sidebar */}
      <div className="w-64 border-r border-neutral-700 flex flex-col">
        <div className="p-4 border-b border-neutral-700">
          <button onClick={() => router.push(`/lessons/${lessonId}`)} className="text-white hover:underline">
            ← Back
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {docs.map((d, i) => (
            <button
              key={d.id}
              onClick={() => setCurrentDoc(i)}
              className={`w-full p-3 text-left text-white border-b border-neutral-800 ${
                i === currentDoc ? 'bg-purple-600' : 'hover:bg-neutral-800'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1">
        <PageViewer key={doc.id} documentId={doc.id} />
      </div>
    </div>
  )
}