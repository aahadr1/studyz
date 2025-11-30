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
  try {
    const mupdf = await import('mupdf')
    const arrayBuffer = pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength)
    const uint8Array = new Uint8Array(arrayBuffer)
    
    const doc = mupdf.Document.openDocument(uint8Array, 'application/pdf')
    const page = doc.loadPage(pageNumber - 1)
    
    const zoom = 2.0 // Higher quality
    const matrix = mupdf.Matrix.scale(zoom, zoom)
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true)
    
    const imageData = pixmap.asPNG()
    const buffer = Buffer.from(imageData)
    
    return {
      buffer,
      width: pixmap.getWidth(),
      height: pixmap.getHeight()
    }
  } catch (error) {
    console.error(`MuPDF image conversion error for page ${pageNumber}:`, error)
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

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { 
            type: 'image_url',
            image_url: { 
              url: `data:image/png;base64,${imageBase64}`,
              detail: 'high'
            }
          }
        ]
      }],
      max_tokens: 4000,
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content || '{}'
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    
    return {
      text: parsed.text || `Page ${pageNumber}`,
      hasVisualContent: parsed.hasVisualContent || false,
      visualElements: parsed.visualElements || [],
      keyTerms: parsed.keyTerms || []
    }
  } catch (error) {
    console.error(`Vision transcription error for page ${pageNumber}:`, error)
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

    try {
      // Download all documents and get page counts
      const documentBuffers = new Map<string, { buffer: Buffer; pageCount: number }>()
      let totalPageCount = 0

      for (const doc of lessonDocs) {
        await updateProgress(id, 'converting', `Téléchargement de ${doc.name}...`, 2, 300)
        
        const { data: fileData, error: downloadError } = await getSupabaseAdmin().storage
          .from('interactive-lessons')
          .download(doc.file_path)

        if (downloadError || !fileData) {
          throw new Error(`Failed to download ${doc.name}`)
        }

        const buffer = Buffer.from(await fileData.arrayBuffer())
        const pageCount = await getPdfPageCount(buffer)
        
        if (pageCount === 0) {
          throw new Error(`Could not detect pages in ${doc.name}`)
        }

        documentBuffers.set(doc.id, { buffer, pageCount })
        totalPageCount += pageCount

        await getSupabaseAdmin()
          .from('interactive_lesson_documents')
          .update({ page_count: pageCount })
          .eq('id', doc.id)
      }

      console.log(`\n========== PHASE 1: CONVERSION DES IMAGES ==========`)
      console.log(`Total pages to process: ${totalPageCount}`)

      // ========== PHASE 1: CONVERT ALL PAGES TO IMAGES (0-30%) ==========
      let convertedPages = 0
      const imageMetadata: Array<{ docId: string; pageNum: number; imagePath: string }> = []

      for (const doc of lessonDocs) {
        const docData = documentBuffers.get(doc.id)
        if (!docData) continue

        const { buffer, pageCount } = docData

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

          const imageResult = await convertPdfPageToImage(buffer, pageNum)
          
          if (!imageResult) {
            console.warn(`Image conversion failed for page ${pageNum}`)
            convertedPages++
            continue
          }

          // Upload image to storage
          const imagePath = `${id}/page-${globalPageNum}.png`
          await getSupabaseAdmin().storage
            .from('interactive-lessons')
            .upload(imagePath, imageResult.buffer, {
              contentType: 'image/png',
              upsert: true
            })

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

          imageMetadata.push({ docId: doc.id, pageNum, imagePath })
          convertedPages++
        }
      }

      console.log(`✓ All ${convertedPages} pages converted to images`)

      // ========== PHASE 2: TRANSCRIBE ALL IMAGES WITH AI (30-80%) ==========
      console.log(`\n========== PHASE 2: TRANSCRIPTION IA ==========`)
      
      let transcribedPages = 0
      const allPageTranscriptions: string[] = []

      for (const { docId, pageNum, imagePath } of imageMetadata) {
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

        // Download image from storage
        const { data: imageData } = await getSupabaseAdmin().storage
          .from('interactive-lessons')
          .download(imagePath)

        if (!imageData) {
          console.warn(`Failed to download image for page ${globalPageNum}`)
          allPageTranscriptions.push(`Page ${globalPageNum} (image not found)`)
          transcribedPages++
          continue
        }

        const imageBuffer = Buffer.from(await imageData.arrayBuffer())
        const imageBase64 = imageBuffer.toString('base64')

        // Transcribe with vision
        const transcription = await transcribePageWithVision(imageBase64, globalPageNum, lesson.language)
        
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
