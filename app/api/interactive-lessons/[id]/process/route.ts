import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for Vercel

// Lazy initialization of admin client
let _supabaseAdmin: any = null
function getSupabaseAdmin(): any {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

// Lazy initialization of OpenAI client
let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return _openai
}

// Helper to create authenticated Supabase client
async function createAuthClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set(name, value, options)
          } catch {
            // Called from Server Component
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', options)
          } catch {
            // Called from Server Component
          }
        },
      },
    }
  )
}

// Processing steps
type ProcessingStep = 'converting' | 'transcribing' | 'analyzing' | 'checkpointing' | 'questions' | 'complete'

// Update progress in database
async function updateProgress(
  lessonId: string, 
  step: ProcessingStep, 
  message: string, 
  percent: number,
  etaSeconds?: number
) {
  console.log(`[${percent}%] ${step}: ${message}`)
  
  await getSupabaseAdmin()
    .from('interactive_lessons')
    .update({
      processing_step: step,
      processing_message: message,
      processing_percent: percent,
      processing_eta_seconds: etaSeconds || null,
      ...(step === 'complete' ? { status: 'ready' } : {})
    })
    .eq('id', lessonId)
}

// Get PDF page count using MuPDF
async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  try {
    const mupdf = await import('mupdf')
    const arrayBuffer = pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength)
    const uint8Array = new Uint8Array(arrayBuffer)
    const doc = mupdf.Document.openDocument(uint8Array, 'application/pdf')
    const count = doc.countPages()
    console.log(`MuPDF detected ${count} pages`)
    return count
  } catch (error) {
    console.error('MuPDF page count error:', error)
    // Fallback: try to parse PDF structure
    const pdfText = pdfBuffer.toString('latin1')
    const countMatch = pdfText.match(/\/Count\s+(\d+)/)
    if (countMatch && countMatch[1]) {
      const count = parseInt(countMatch[1], 10)
      console.log(`Manual parsing detected ${count} pages`)
      return count
    }
    console.log('Defaulting to 1 page')
    return 1
  }
}

// Convert PDF page to image using MuPDF
async function convertPdfPageToImage(
  pdfBuffer: Buffer, 
  pageNumber: number
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  console.log(`       [MuPDF] Converting page ${pageNumber} to image...`)
  try {
    console.log(`       [MuPDF] Importing mupdf module...`)
    const mupdf = await import('mupdf')
    console.log(`       [MuPDF] ✓ Module imported`)
    
    console.log(`       [MuPDF] Creating ArrayBuffer from PDF buffer (${pdfBuffer.length} bytes)...`)
    const arrayBuffer = pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength)
    const uint8Array = new Uint8Array(arrayBuffer)
    console.log(`       [MuPDF] ✓ Uint8Array created (${uint8Array.length} bytes)`)
    
    console.log(`       [MuPDF] Opening PDF document...`)
    const doc = mupdf.Document.openDocument(uint8Array, 'application/pdf')
    console.log(`       [MuPDF] ✓ Document opened`)
    
    console.log(`       [MuPDF] Loading page ${pageNumber - 1} (0-indexed)...`)
    const page = doc.loadPage(pageNumber - 1)
    console.log(`       [MuPDF] ✓ Page loaded`)
    
    const zoom = 2.0 // Higher quality
    console.log(`       [MuPDF] Creating matrix with zoom=${zoom}...`)
    const matrix = mupdf.Matrix.scale(zoom, zoom)
    
    console.log(`       [MuPDF] Rendering page to pixmap...`)
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true)
    console.log(`       [MuPDF] ✓ Pixmap created: ${pixmap.getWidth()}x${pixmap.getHeight()}`)
    
    console.log(`       [MuPDF] Converting to PNG...`)
    const imageData = pixmap.asPNG()
    const buffer = Buffer.from(imageData)
    console.log(`       [MuPDF] ✓ PNG created: ${buffer.length} bytes`)
    
    return {
      buffer,
      width: pixmap.getWidth(),
      height: pixmap.getHeight()
    }
  } catch (error) {
    console.error(`       [MuPDF] ❌ ERROR converting page ${pageNumber}:`)
    console.error(`       [MuPDF] ❌ Error type: ${error instanceof Error ? error.constructor.name : typeof error}`)
    console.error(`       [MuPDF] ❌ Error message: ${error instanceof Error ? error.message : String(error)}`)
    if (error instanceof Error && error.stack) {
      console.error(`       [MuPDF] ❌ Stack trace:`, error.stack)
    }
    return null
  }
}

// Transcribe page with GPT-4o-mini vision
interface PageTranscription {
  text: string
  hasVisualContent: boolean
  visualElements: Array<{
    type: 'diagram' | 'table' | 'formula' | 'image' | 'chart'
    description: string
    position?: string
  }>
  keyTerms: Array<{ 
    type: string
    term: string
    explanation: string 
  }>
}

async function transcribePageWithVision(
  imageBase64: string,
  pageNumber: number,
  language: string
): Promise<PageTranscription> {
  const langName = language === 'fr' ? 'français' : language === 'en' ? 'English' : language

  const prompt = `Analyse cette page ${pageNumber} de cours.

TÂCHES:
1. TRANSCRIS tout le texte visible (titres, paragraphes, légendes, formules) - MOT POUR MOT
2. DÉCRIS tous les éléments visuels (diagrammes, tableaux, schémas, graphiques, images)
3. IDENTIFIE 3-5 termes/concepts clés avec explications

Réponds en ${langName}.

RÉPONDS EN JSON (pas de markdown):
{
  "text": "Transcription complète du texte de la page...",
  "hasVisualContent": true,
  "visualElements": [
    {
      "type": "diagram",
      "description": "Description détaillée du diagramme...",
      "position": "haut de page"
    }
  ],
  "keyTerms": [
    {
      "type": "term",
      "term": "Nom du concept",
      "explanation": "Explication claire"
    }
  ]
}`

  console.log(`       📝 Prompt language: ${langName}`)
  console.log(`       📝 Prompt length: ${prompt.length} chars`)
  console.log(`       🖼️  Image base64 length: ${imageBase64.length} chars`)
  console.log(`       🖼️  Image base64 preview: ${imageBase64.substring(0, 50)}...`)
  console.log(`       🖼️  Image URL format: data:image/png;base64,[${imageBase64.length} chars]`)

  try {
    const messageContent = [
      { type: 'text' as const, text: prompt },
      { 
        type: 'image_url' as const,
        image_url: { 
          url: `data:image/png;base64,${imageBase64}`,
          detail: 'high' as const
        }
      }
    ]

    console.log(`       ✓ Message content prepared: ${messageContent.length} parts`)
    console.log(`         - Part 1: text (${prompt.length} chars)`)
    console.log(`         - Part 2: image_url (base64 data)`)
    console.log(`       🌐 Sending request to OpenAI API...`)
    
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: messageContent
      }],
      max_tokens: 4000,
      temperature: 0.3,
    })

    console.log(`       ✓ OpenAI response received`)
    console.log(`       ✓ Model: ${response.model}`)
    console.log(`       ✓ Tokens used: ${response.usage?.total_tokens || 'unknown'}`)

    const content = response.choices[0]?.message?.content || '{}'
    console.log(`       ✓ Response content length: ${content.length} chars`)
    
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    
    console.log(`       ✓ JSON parsed successfully`)
    console.log(`       ✓ Text extracted: ${parsed.text ? parsed.text.substring(0, 100) + '...' : 'empty'}`)
    
    return {
      text: parsed.text || `Page ${pageNumber}`,
      hasVisualContent: parsed.hasVisualContent || false,
      visualElements: parsed.visualElements || [],
      keyTerms: parsed.keyTerms || []
    }
  } catch (error) {
    console.error(`       ❌ Vision transcription error for page ${pageNumber}:`, error)
    if (error instanceof Error) {
      console.error(`       ❌ Error message: ${error.message}`)
      console.error(`       ❌ Error stack: ${error.stack}`)
    }
    return {
      text: `Page ${pageNumber} (transcription failed)`,
      hasVisualContent: false,
      visualElements: [],
      keyTerms: []
    }
  }
}

// Analyze document structure from all transcriptions
interface DocumentStructure {
  checkpoints: Array<{
    title: string
    startPage: number
    endPage: number
    summary: string
    keyPoints: string[]
  }>
}

async function analyzeDocumentStructure(
  fullText: string,
  totalPages: number, 
  language: string
): Promise<DocumentStructure> {
  const langName = language === 'fr' ? 'français' : language === 'en' ? 'English' : language
  
  const truncatedText = fullText.length > 100000 ? fullText.slice(0, 100000) + '\n...[truncated]' : fullText

  const prompt = `Analyse ce cours complet de ${totalPages} pages.

TEXTE COMPLET DU COURS (en ${langName}):
${truncatedText}

TÂCHE:
Crée 4-8 checkpoints logiques qui couvrent tout le cours.
Pour chaque checkpoint:
- Identifie les pages concernées (startPage, endPage)
- Donne un titre clair
- Écris un résumé de 2-3 phrases
- Liste 3-5 points clés

RÉPONDS EN JSON (pas de markdown):
{
  "checkpoints": [
    {
      "title": "Introduction aux concepts fondamentaux",
      "startPage": 1,
      "endPage": 5,
      "summary": "Ce chapitre couvre les bases...",
      "keyPoints": ["Point 1", "Point 2", "Point 3"]
    }
  ]
}`

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8000,
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content || '{}'
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    
    // Validate page numbers
    if (parsed.checkpoints) {
      parsed.checkpoints = parsed.checkpoints.map((cp: any) => ({
        ...cp,
        startPage: Math.max(1, Math.min(cp.startPage || 1, totalPages)),
        endPage: Math.max(1, Math.min(cp.endPage || totalPages, totalPages)),
        keyPoints: cp.keyPoints || []
      }))
    }
    
    return parsed
  } catch (error) {
    console.error('Structure analysis error:', error)
    return {
      checkpoints: [{
        title: 'Contenu complet',
        startPage: 1,
        endPage: totalPages,
        summary: 'Document de cours',
        keyPoints: []
      }]
    }
  }
}

// Generate ALL questions in one batch
interface Question {
  question: string
  choices: string[]
  correctIndex: number
  explanation: string
  checkpointIndex: number
}

async function generateAllQuestions(
  checkpoints: DocumentStructure['checkpoints'],
  fullText: string,
  language: string
): Promise<Question[]> {
  const langName = language === 'fr' ? 'français' : language === 'en' ? 'English' : language
  
  const checkpointSummaries = checkpoints.map((cp, idx) => 
    `Checkpoint ${idx + 1} (pages ${cp.startPage}-${cp.endPage}): "${cp.title}" - ${cp.summary}`
  ).join('\n')

  const truncatedText = fullText.length > 60000 ? fullText.slice(0, 60000) : fullText

  const prompt = `Génère EXACTEMENT 10 QCM par checkpoint pour ce cours.

CHECKPOINTS (${checkpoints.length} total):
${checkpointSummaries}

CONTENU DU COURS (${langName}):
${truncatedText}

INSTRUCTIONS CRITIQUES:
- Génère EXACTEMENT 10 questions pour CHAQUE checkpoint (total: ${checkpoints.length * 10} questions)
- checkpointIndex va de 0 à ${checkpoints.length - 1}
- Chaque question a EXACTEMENT 4 choix
- correctIndex entre 0 et 3
- Questions de COMPRÉHENSION
- Explications détaillées
- Tout en ${langName}

RÉPONDS EN JSON (pas de markdown):
{
  "questions": [
    {
      "question": "Question détaillée?",
      "choices": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "Explication...",
      "checkpointIndex": 0
    }
  ]
}`

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 16000,
      temperature: 0.5,
    })

    const content = response.choices[0]?.message?.content || '{}'
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return parsed.questions || []
  } catch (error) {
    console.error('Question generation error:', error)
    return []
  }
}

// Main processing function
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const startTime = Date.now()
  
  try {
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get lesson
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('*, interactive_lesson_documents(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    if (lesson.status === 'processing') {
      return NextResponse.json({ error: 'Already processing' }, { status: 400 })
    }

    const documents = lesson.interactive_lesson_documents || []
    const lessonDocs = documents.filter((d: any) => d.category === 'lesson')

    if (lessonDocs.length === 0) {
      return NextResponse.json({ error: 'No lesson documents' }, { status: 400 })
    }

    // Start processing
    console.log(`\n\n`)
    console.log(`╔══════════════════════════════════════════════════════════════╗`)
    console.log(`║     INTERACTIVE LESSON PROCESSING STARTED                    ║`)
    console.log(`║     Lesson ID: ${id}`)
    console.log(`║     Time: ${new Date().toISOString()}`)
    console.log(`╚══════════════════════════════════════════════════════════════╝`)
    console.log(`\n`)

    await getSupabaseAdmin()
      .from('interactive_lessons')
      .update({ 
        status: 'processing',
        processing_started_at: new Date().toISOString(),
        processing_step: 'converting',
        processing_percent: 0,
        processing_message: 'Démarrage...',
        error_message: null
      })
      .eq('id', id)

    console.log(`[INIT] Found ${lessonDocs.length} lesson documents to process`)
    lessonDocs.forEach((doc: any, i: number) => {
      console.log(`  ${i + 1}. ${doc.name} (path: ${doc.file_path})`)
    })

    try {
      // Download all documents and get page counts
      console.log(`\n[DOWNLOAD] Starting document downloads...`)
      const documentBuffers = new Map<string, { buffer: Buffer; pageCount: number }>()
      let totalPageCount = 0

      for (const doc of lessonDocs) {
        console.log(`\n[DOWNLOAD] Processing: ${doc.name}`)
        console.log(`  File path: ${doc.file_path}`)
        
        await updateProgress(id, 'converting', `Téléchargement de ${doc.name}...`, 2, 300)
        
        const { data: fileData, error: downloadError } = await getSupabaseAdmin().storage
          .from('interactive-lessons')
          .download(doc.file_path)

        if (downloadError || !fileData) {
          console.error(`  ❌ DOWNLOAD FAILED:`, downloadError)
          throw new Error(`Failed to download ${doc.name}`)
        }

        console.log(`  ✓ File downloaded successfully`)
        const buffer = Buffer.from(await fileData.arrayBuffer())
        console.log(`  ✓ Buffer created: ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`)
        
        console.log(`  🔍 Getting page count with MuPDF...`)
        const pageCount = await getPdfPageCount(buffer)
        console.log(`  ✓ Page count: ${pageCount}`)
        
        if (pageCount === 0) {
          console.error(`  ❌ PAGE COUNT IS ZERO!`)
          throw new Error(`Could not detect pages in ${doc.name}`)
        }

        documentBuffers.set(doc.id, { buffer, pageCount })
        totalPageCount += pageCount
        console.log(`  ✓ Document added to buffer map`)

        await getSupabaseAdmin()
          .from('interactive_lesson_documents')
          .update({ page_count: pageCount })
          .eq('id', doc.id)
      }

      console.log(`\n[DOWNLOAD] ✓ All documents downloaded`)
      console.log(`[DOWNLOAD] Total page count: ${totalPageCount}`)
      console.log(`[DOWNLOAD] Buffer map size: ${documentBuffers.size}`)

      console.log(`\n`)
      console.log(`╔══════════════════════════════════════════════════════════════╗`)
      console.log(`║     PHASE 1: CONVERSION DES IMAGES (0-30%)                   ║`)
      console.log(`║     Total pages: ${totalPageCount}`)
      console.log(`╚══════════════════════════════════════════════════════════════╝`)

      // ========== PHASE 1: CONVERT ALL PAGES TO IMAGES (0-30%) ==========
      let convertedPages = 0
      const imageMetadata: Array<{ docId: string; pageNum: number; imagePath: string }> = []

      console.log(`\n[PHASE 1] Starting image conversion...`)
      console.log(`[PHASE 1] Documents to process: ${lessonDocs.length}`)

      for (const doc of lessonDocs) {
        console.log(`\n[PHASE 1] Processing document: ${doc.name}`)
        const docData = documentBuffers.get(doc.id)
        if (!docData) {
          console.error(`[PHASE 1] ❌ No buffer found for document ${doc.id}! SKIPPING!`)
          continue
        }

        const { buffer, pageCount } = docData
        console.log(`[PHASE 1] ✓ Buffer found: ${buffer.length} bytes, ${pageCount} pages`)
        console.log(`[PHASE 1] Starting page loop from 1 to ${pageCount}...`)

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          const globalPageNum = convertedPages + 1
          const percent = Math.round((convertedPages / totalPageCount) * 30)
          const eta = Math.max(10, (totalPageCount - convertedPages) * 4)

          await updateProgress(
            id, 
            'converting', 
            `Conversion page ${globalPageNum}/${totalPageCount} en image...`, 
            percent,
            eta
          )

          console.log(`\n>>> Conversion page ${globalPageNum}/${totalPageCount}`)
          console.log(`    Document: ${doc.name}`)
          console.log(`    Local page: ${pageNum}`)

          const imageResult = await convertPdfPageToImage(buffer, pageNum)
          
          if (!imageResult) {
            console.error(`    ❌ Image conversion failed for page ${pageNum}`)
            convertedPages++
            continue
          }

          console.log(`    ✓ Image converted: ${imageResult.width}x${imageResult.height}px`)
          console.log(`    ✓ Image size: ${(imageResult.buffer.length / 1024).toFixed(2)} KB`)

          // Upload image to storage
          const imagePath = `${id}/page-${globalPageNum}.png`
          console.log(`    📤 Uploading to: ${imagePath}`)
          
          const { error: uploadError } = await getSupabaseAdmin().storage
            .from('interactive-lessons')
            .upload(imagePath, imageResult.buffer, {
              contentType: 'image/png',
              upsert: true
            })

          if (uploadError) {
            console.error(`    ❌ Upload failed:`, uploadError)
          } else {
            console.log(`    ✓ Image uploaded to Supabase Storage`)
          }

          // Store image record in DB
          await getSupabaseAdmin()
            .from('interactive_lesson_page_images')
            .upsert({
              document_id: doc.id,
              page_number: pageNum,
              image_path: imagePath,
              width: imageResult.width,
              height: imageResult.height
            }, { onConflict: 'document_id,page_number' })

          console.log(`    ✓ Image record stored in DB`)

          imageMetadata.push({ docId: doc.id, pageNum, imagePath })
          convertedPages++
        }
      }

      console.log(`\n[PHASE 1] ✓ CONVERSION COMPLETE`)
      console.log(`[PHASE 1] ✓ Pages converted: ${convertedPages}`)
      console.log(`[PHASE 1] ✓ Image metadata entries: ${imageMetadata.length}`)
      if (imageMetadata.length > 0) {
        console.log(`[PHASE 1] ✓ First image: ${imageMetadata[0].imagePath}`)
        console.log(`[PHASE 1] ✓ Last image: ${imageMetadata[imageMetadata.length - 1].imagePath}`)
      } else {
        console.error(`[PHASE 1] ❌ WARNING: imageMetadata is EMPTY! No images to transcribe!`)
      }

      // ========== PHASE 2: TRANSCRIBE ALL IMAGES WITH AI (30-80%) ==========
      console.log(`\n`)
      console.log(`╔══════════════════════════════════════════════════════════════╗`)
      console.log(`║     PHASE 2: TRANSCRIPTION IA (30-80%)                       ║`)
      console.log(`║     Images to transcribe: ${imageMetadata.length}`)
      console.log(`╚══════════════════════════════════════════════════════════════╝`)
      
      if (imageMetadata.length === 0) {
        console.error(`\n❌❌❌ CRITICAL ERROR: NO IMAGES TO TRANSCRIBE! ❌❌❌`)
        console.error(`This means Phase 1 failed to create any images.`)
        throw new Error('No images were converted - cannot proceed with transcription')
      }
      
      let transcribedPages = 0
      const allPageTranscriptions: string[] = []

      console.log(`\n[PHASE 2] Starting transcription loop...`)
      for (const { docId, pageNum, imagePath } of imageMetadata) {
        console.log(`\n[PHASE 2] ═══════════════════════════════════════════════`)
        console.log(`[PHASE 2] Processing image: ${imagePath}`)
        const globalPageNum = transcribedPages + 1
        const percent = 30 + Math.round((transcribedPages / totalPageCount) * 50) // 30-80%
        const eta = Math.max(10, (totalPageCount - transcribedPages) * 3)

        await updateProgress(
          id, 
          'transcribing', 
          `Transcription IA page ${globalPageNum}/${totalPageCount}...`, 
          percent,
          eta
        )

        console.log(`\n>>> Transcription page ${globalPageNum}/${totalPageCount}`)
        console.log(`    Image path: ${imagePath}`)

        // Download image from storage
        console.log(`    📥 Downloading image from Supabase Storage...`)
        const { data: imageData, error: downloadError } = await getSupabaseAdmin().storage
          .from('interactive-lessons')
          .download(imagePath)

        if (!imageData || downloadError) {
          console.error(`    ❌ Failed to download image:`, downloadError)
          allPageTranscriptions.push(`Page ${globalPageNum} (image not found)`)
          transcribedPages++
          continue
        }

        const imageBuffer = Buffer.from(await imageData.arrayBuffer())
        console.log(`    ✓ Image downloaded: ${imageBuffer.length} bytes (${(imageBuffer.length / 1024).toFixed(2)} KB)`)

        const imageBase64 = imageBuffer.toString('base64')
        console.log(`    ✓ Image converted to base64: ${imageBase64.length} chars`)

        // Transcribe with vision
        console.log(`    🤖 Calling GPT-4o-mini vision API...`)
        const transcription = await transcribePageWithVision(imageBase64, globalPageNum, lesson.language)
        console.log(`    ✓ Transcription received: ${transcription.text.length} chars`)
        console.log(`    ✓ Visual elements: ${transcription.visualElements.length}`)
        console.log(`    ✓ Key terms: ${transcription.keyTerms.length}`)
        
        // Show first transcription as proof
        if (globalPageNum === 1) {
          console.log(`\n    ═══════════════════════════════════════════════`)
          console.log(`    📄 FIRST PAGE TRANSCRIPTION (PROOF OF CONCEPT)`)
          console.log(`    ═══════════════════════════════════════════════`)
          console.log(`    Text preview: ${transcription.text.substring(0, 300)}...`)
          console.log(`    Has visual content: ${transcription.hasVisualContent}`)
          if (transcription.visualElements.length > 0) {
            console.log(`    Visual elements:`)
            transcription.visualElements.forEach((ve, idx) => {
              console.log(`      ${idx + 1}. ${ve.type}: ${ve.description.substring(0, 80)}...`)
            })
          }
          console.log(`    ═══════════════════════════════════════════════\n`)
        }
        
        // Add to full text with page marker
        allPageTranscriptions.push(`Page ${globalPageNum}:\n${transcription.text}`)

        // Store transcription in DB
        const { data: pageText } = await getSupabaseAdmin()
          .from('interactive_lesson_page_texts')
          .upsert({
            document_id: docId,
            page_number: pageNum,
            text_content: transcription.text,
            transcription_type: 'vision',
            has_visual_content: transcription.hasVisualContent,
            elements_description: JSON.stringify(transcription.visualElements)
          }, { onConflict: 'document_id,page_number' })
          .select()
          .single()

        // Store key terms as page elements
        if (pageText && transcription.keyTerms.length > 0) {
          for (const term of transcription.keyTerms) {
            await getSupabaseAdmin()
              .from('interactive_lesson_page_elements')
              .insert({
                page_text_id: pageText.id,
                element_type: term.type,
                element_text: term.term,
                explanation: term.explanation,
                element_order: 0
              })
          }
        }

        transcribedPages++
      }

      console.log(`✓ All ${transcribedPages} pages transcribed`)

      // ========== PHASE 3: ANALYZE STRUCTURE (80-90%) ==========
      console.log(`\n========== PHASE 3: ANALYSE DE STRUCTURE ==========`)
      
      await updateProgress(id, 'analyzing', 'Analyse de la structure du cours...', 82, 40)
      
      // Combine all transcriptions into one text
      const fullText = allPageTranscriptions.join('\n\n')
      
      const structure = await analyzeDocumentStructure(fullText, totalPageCount, lesson.language)
      
      console.log(`✓ Found ${structure.checkpoints.length} checkpoints`)

      // Store reconstruction
      await getSupabaseAdmin()
        .from('interactive_lesson_reconstructions')
        .upsert({
          interactive_lesson_id: id,
          full_content: fullText.slice(0, 500000), // Limit to 500k chars
          structure_json: structure
        }, { onConflict: 'interactive_lesson_id' })

      // ========== PHASE 4: CREATE CHECKPOINTS AND QUESTIONS (90-100%) ==========
      console.log(`\n========== PHASE 4: CHECKPOINTS & QUESTIONS ==========`)
      
      await updateProgress(id, 'checkpointing', 'Création des checkpoints...', 87, 30)

      const createdCheckpoints: Array<{ id: string; index: number }> = []

      for (let i = 0; i < structure.checkpoints.length; i++) {
        const cp = structure.checkpoints[i]
        
        const { data: checkpoint } = await getSupabaseAdmin()
          .from('interactive_lesson_checkpoints')
          .insert({
            interactive_lesson_id: id,
            checkpoint_order: i + 1,
            title: cp.title,
            checkpoint_type: 'topic',
            start_page: cp.startPage,
            end_page: cp.endPage,
            summary: cp.summary,
            pass_threshold: 70
          })
          .select()
          .single()

        if (checkpoint) {
          createdCheckpoints.push({ id: checkpoint.id, index: i })
          
          // Legacy section for backwards compatibility
          await getSupabaseAdmin()
            .from('interactive_lesson_sections')
            .insert({
              interactive_lesson_id: id,
              section_order: i + 1,
              title: cp.title,
              start_page: cp.startPage,
              end_page: cp.endPage,
              summary: cp.summary,
              key_points: cp.keyPoints,
              pass_threshold: 70
            })
        }
      }

      console.log(`✓ Created ${createdCheckpoints.length} checkpoints`)

      await updateProgress(id, 'questions', 'Génération des questions...', 93, 20)
      
      const questions = await generateAllQuestions(structure.checkpoints, fullText, lesson.language)
      
      console.log(`✓ Generated ${questions.length} questions`)
      
      // Count questions per checkpoint
      const questionsPerCheckpoint = new Map<number, number>()
      questions.forEach(q => {
        questionsPerCheckpoint.set(q.checkpointIndex, (questionsPerCheckpoint.get(q.checkpointIndex) || 0) + 1)
      })
      questionsPerCheckpoint.forEach((count, idx) => {
        console.log(`  Checkpoint ${idx}: ${count} questions`)
      })

      // Store questions
      let storedCount = 0
      for (const q of questions) {
        const checkpoint = createdCheckpoints.find(c => c.index === q.checkpointIndex)
        if (checkpoint) {
          const { error: insertError } = await getSupabaseAdmin()
            .from('interactive_lesson_questions')
            .insert({
              checkpoint_id: checkpoint.id,
              question: q.question,
              choices: q.choices,
              correct_index: q.correctIndex,
              explanation: q.explanation,
              question_order: 0
            })
          
          if (!insertError) {
            storedCount++
          } else {
            console.error(`Failed to store question:`, insertError)
          }
        }
      }
      
      console.log(`✓ Stored ${storedCount}/${questions.length} questions`)

      // Complete
      const totalTime = Math.round((Date.now() - startTime) / 1000)
      await updateProgress(id, 'complete', `Terminé en ${totalTime}s !`, 100, 0)

      console.log(`\n========== PROCESSING COMPLETE ==========`)
      console.log(`Duration: ${totalTime}s`)
      console.log(`Pages: ${totalPageCount}`)
      console.log(`Checkpoints: ${structure.checkpoints.length}`)
      console.log(`Questions: ${storedCount}`)

      return NextResponse.json({ 
        success: true,
        duration: totalTime,
        pages: totalPageCount,
        checkpoints: structure.checkpoints.length,
        questions: storedCount
      })

    } catch (processingError: any) {
      console.error('Processing error:', processingError)
      
      await getSupabaseAdmin()
        .from('interactive_lessons')
        .update({ 
          status: 'error',
          error_message: processingError.message || 'Erreur de traitement',
          processing_step: 'error',
          processing_percent: 0
        })
        .eq('id', id)

      return NextResponse.json(
        { error: processingError.message || 'Processing failed' },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/process:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
