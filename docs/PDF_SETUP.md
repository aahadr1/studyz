# PDF Viewer Setup

## Overview

This application uses `react-pdf` with a local PDF.js worker to display PDF documents without CORS issues.

## Implementation

### 1. Dependencies
- `react-pdf`: React components for PDF rendering
- `pdfjs-dist`: PDF.js library for PDF processing

### 2. Worker Configuration
The PDF worker is served locally to avoid CORS issues:
- Worker file: `/public/pdf.worker.min.js`
- Worker source: `pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'`

### 3. Components

#### PageViewer (`/components/PageViewer.tsx`)
- Main component for displaying PDFs
- Handles signed URL fetching
- Provides text extraction for AI assistant

#### PdfPager (`/components/PdfPager.tsx`)
- Core PDF rendering component using react-pdf
- Features:
  - Page navigation (buttons + keyboard arrows)
  - Zoom controls (50% - 250%)
  - Text extraction for AI
  - Responsive design

### 4. Text Extraction
Text is extracted from each page for AI assistant integration:
```typescript
const extractText = async (pdf: any, pageNum: number) => {
  const page = await pdf.getPage(pageNum)
  const textContent = await page.getTextContent()
  const text = textContent.items.map(i => i.str).join(' ')
  return text.trim()
}
```

### 5. Voice Integration
The voice assistant receives page text and can:
- Navigate pages ("next page", "go to page 5")
- Read page content aloud ("read this page")
- Analyze content ("summarize this page")

## Setup Commands

### Initial Setup (already done)
```bash
npm install react-pdf pdfjs-dist
cp node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js public/pdf.worker.min.js
```

### Automatic Setup
The `postinstall` script automatically copies the worker file:
```json
{
  "scripts": {
    "postinstall": "cp node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js public/pdf.worker.min.js"
  }
}
```

## Features

✅ **No CORS Issues** - Local worker file  
✅ **Fast Loading** - Browser-optimized rendering  
✅ **Text Extraction** - Real content for AI  
✅ **Keyboard Navigation** - Arrow keys work  
✅ **Zoom Controls** - 50% to 250% scaling  
✅ **Page Tracking** - AI knows current page  
✅ **Voice Commands** - Full integration  

## Troubleshooting

### Worker Not Found
If you see "Worker not found" errors:
1. Check if `/public/pdf.worker.min.js` exists
2. Run: `npm run postinstall`
3. Restart the development server

### CORS Issues
If CORS errors persist:
1. Ensure worker source points to local file
2. Check that signed URLs are properly configured
3. Verify no external CDN workers are being used

### Text Extraction Fails
If text extraction doesn't work:
1. Check browser console for PDF loading errors
2. Verify PDF is not image-only (scanned document)
3. Test with different PDF files
