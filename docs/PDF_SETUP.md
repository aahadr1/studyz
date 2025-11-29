# PDF Viewer Setup

## Overview

This application uses `react-pdf` with a matching PDF.js worker to display PDF documents.

## Implementation

### 1. Dependencies
- `react-pdf`: React components for PDF rendering  
- `pdfjs-dist`: PDF.js library for PDF processing

### 2. Worker Configuration
The PDF worker is loaded from unpkg CDN with **matching version**:
```typescript
import { pdfjs } from 'react-pdf'
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
```

**Important:** 
- Version 5+ uses `.mjs` module format (not `.js`)
- `pdfjs.version` ensures API and worker versions always match
- unpkg CDN provides proper CORS headers

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

### Version Mismatch Error
If you see "API version X ≠ Worker version Y":
1. This means the worker and API versions don't match
2. The fix: use dynamic version loading:
```typescript
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
```
3. Delete any old worker files from `/public/`

### CORS Issues
If CORS errors persist:
1. Make sure you're using `unpkg.com` CDN (has proper CORS headers)
2. Ensure you're using `.mjs` extension for v5+ workers
3. Check that signed URLs are properly configured

### Text Extraction Fails
If text extraction doesn't work:
1. Check browser console for PDF loading errors
2. Verify PDF is not image-only (scanned document)
3. Test with different PDF files

## Migration from Local Worker

If upgrading from local worker setup:
1. Delete `/public/pdf.worker.min.js` (old file)
2. Update workerSrc to use CDN with `pdfjs.version`
3. Remove any `postinstall` scripts that copy worker files
