import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// Lazy initialization of Supabase admin client
let _supabase: any = null
function getSupabase(): any {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

async function processPDF(fileBuffer: Buffer, documentId: string, userId: string) {
  const pages: string[] = []
  
  try {
    // Note: We don't need to convert PDF to images anymore!
    // The PDFViewer component renders PDFs directly in the browser using PDF.js
    // This is actually better: faster, no storage costs, and works on Vercel!
    
    console.log('Document uploaded successfully - will be rendered client-side with PDF.js')
    
    // Set a placeholder page count (will be updated when PDF loads in browser)
    // The actual page count will be determined by PDF.js in the PDFViewer component
    await getSupabase()
      .from('documents')
      .update({ page_count: 1 })
      .eq('id', documentId)

    return pages
  } catch (error) {
    console.error('Error processing PDF:', error)
    throw error
  }
}

async function processPPTX(fileBuffer: Buffer, documentId: string, userId: string) {
  // Placeholder for PPTX processing
  // In production, you would use a library or service to convert PPTX to images
  // Options:
  // 1. Use LibreOffice headless mode via child_process
  // 2. Use a cloud service like CloudConvert API
  // 3. Use pptx-to-image or similar npm packages
  
  console.log('PPTX processing not yet implemented')
  console.log('Consider using: LibreOffice headless, CloudConvert API, or pptx2img')
  
  return []
}

async function processDOCX(fileBuffer: Buffer, documentId: string, userId: string) {
  // Placeholder for DOCX processing
  // Similar to PPTX, options include:
  // 1. LibreOffice headless mode
  // 2. Cloud conversion services
  // 3. mammoth.js for HTML conversion, then puppeteer for screenshots
  
  console.log('DOCX processing not yet implemented')
  console.log('Consider using: LibreOffice headless, CloudConvert API, or mammoth + puppeteer')
  
  return []
}

export async function POST(request: NextRequest) {
  try {
    const { documentId, filePath, fileType } = await request.json()

    if (!documentId || !filePath) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Extract userId from filePath (format: userId/lessonId/filename)
    const userId = filePath.split('/')[0]

    // Download file from Supabase storage
    const { data: fileData, error: downloadError } = await getSupabase().storage
      .from('documents')
      .download(filePath)

    if (downloadError) {
      console.error('Error downloading file:', downloadError)
      return NextResponse.json(
        { error: 'Failed to download file' },
        { status: 500 }
      )
    }

    // Convert to buffer
    const fileBuffer = Buffer.from(await fileData.arrayBuffer())

    let pages: string[] = []

    // Process based on file type
    const normalizedFileType = fileType.toLowerCase()
    
    if (normalizedFileType === 'pdf') {
      pages = await processPDF(fileBuffer, documentId, userId)
    } else if (normalizedFileType === 'pptx' || normalizedFileType === 'ppt') {
      pages = await processPPTX(fileBuffer, documentId, userId)
    } else if (normalizedFileType === 'docx' || normalizedFileType === 'doc') {
      pages = await processDOCX(fileBuffer, documentId, userId)
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${fileType}` },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      pagesProcessed: pages.length,
      pages,
    })
  } catch (error: any) {
    console.error('Error processing document:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process document' },
      { status: 500 }
    )
  }
}
