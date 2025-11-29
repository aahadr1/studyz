'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const PdfPager = dynamic(() => import('./PdfPager'), { ssr: false })

export default function PageViewer({ documentId }: { documentId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/documents/${documentId}/signed-url`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setUrl(d.signedUrl))
      .catch(() => setError(true))
  }, [documentId])

  if (error) {
    return <div className="flex-1 flex items-center justify-center text-red-400">Failed to load</div>
  }

  if (!url) {
    return <div className="flex-1 flex items-center justify-center text-white">Loading...</div>
  }

  return <PdfPager url={url} />
}