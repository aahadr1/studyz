// Client-side document processing utilities
// For cases where we need to preview or process documents in the browser

export function getFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext || 'unknown'
}

export function isDocumentSupported(filename: string): boolean {
  const supportedTypes = ['pdf', 'pptx', 'ppt', 'docx', 'doc']
  const fileType = getFileType(filename)
  return supportedTypes.includes(fileType)
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

export async function getDocumentPageImage(
  documentId: string,
  pageNumber: number
): Promise<string | null> {
  // This would fetch the pre-processed page image from Supabase storage
  // Returns a public URL or blob URL for the image
  return null
}

