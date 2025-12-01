'use client'

interface UploadProgressProps {
  progress: number
  fileName?: string
}

export default function UploadProgress({ progress, fileName }: UploadProgressProps) {
  return (
    <div className="p-4 bg-surface border border-border rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-primary truncate max-w-[200px]">
          {fileName || 'Uploading...'}
        </span>
        <span className="text-sm text-text-secondary">{progress}%</span>
      </div>
      <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
