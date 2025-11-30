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
  elements: Array<{ type: string; term: string; explanation: string }>
  hasVisualContent: boolean
}

async function transcribePageWithVision(
  imageBase64: string,
  pageNumber: number,
  language: string
): Promise<PageTranscription> {
  const langName = language === 'fr' ? 'French' : language === 'en' ? 'English' : language

  const prompt = `Tu es un expert en analyse de documents pédagogiques. Analyse cette page de cours (page ${pageNumber}).

INSTRUCTIONS:
1. Transcris TOUT le texte visible (titres, paragraphes, légendes, formules)
2. Décris les éléments visuels (diagrammes, tableaux, images, schémas)
3. Identifie 3-5 termes/concepts clés avec leur explication
4. Réponds en ${langName}

RÉPONDS EN JSON (pas de markdown):
{
  "text": "Transcription complète du texte...",
  "hasVisualContent": true/false,
  "elements": [
    {"type": "term", "term": "Concept X", "explanation": "Explication simple"}
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
      elements: parsed.elements || [],
      hasVisualContent: parsed.hasVisualContent || false
    }
  } catch (error) {
    console.error(`Vision transcription error for page ${pageNumber}:`, error)
    return {
      text: `Page ${pageNumber} (transcription failed)`,
      elements: [],
      hasVisualContent: false
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
  pageTranscriptions: string[], 
  totalPages: number, 
  language: string
): Promise<DocumentStructure> {
  const langName = language === 'fr' ? 'French' : language === 'en' ? 'English' : language
  
  // Combine all transcriptions
  const fullText = pageTranscriptions.join('\n\n---PAGE BREAK---\n\n')
  const truncatedText = fullText.length > 80000 ? fullText.slice(0, 80000) + '\n...[truncated]' : fullText

  const prompt = `Tu es un expert pédagogique. Structure ce cours en checkpoints pour l'apprentissage.

DOCUMENT (${totalPages} pages, en ${langName}):
${truncatedText}

INSTRUCTIONS:
1. Divise en 4-8 checkpoints logiques (chapitres/sections)
2. Chaque checkpoint = concept cohérent à maîtriser
3. Pour chaque checkpoint:
   - Pages concernées (start_page, end_page)
   - Titre clair
   - Résumé 2-3 phrases
   - 3-5 points clés

RÉPONDS EN JSON (pas de markdown):
{
  "checkpoints": [
    {
      "title": "Titre",
      "startPage": 1,
      "endPage": 3,
      "summary": "Résumé...",
      "keyPoints": ["Point 1", "Point 2"]
    }
  ]
}`

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 6000,
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
  pageTranscriptions: string[],
  language: string
): Promise<Question[]> {
  const langName = language === 'fr' ? 'French' : language === 'en' ? 'English' : language
  
  const checkpointSummaries = checkpoints.map((cp, idx) => 
    `Checkpoint ${idx + 1} (pages ${cp.startPage}-${cp.endPage}): "${cp.title}" - ${cp.summary}`
  ).join('\n')

  const fullText = pageTranscriptions.join('\n\n')
  const truncatedText = fullText.length > 50000 ? fullText.slice(0, 50000) : fullText

  const prompt = `Tu es un expert en pédagogie. Génère EXACTEMENT 10 QCM par checkpoint pour ce cours.

CHECKPOINTS (${checkpoints.length} total):
${checkpointSummaries}

CONTENU DU COURS (${langName}):
${truncatedText}

INSTRUCTIONS CRITIQUES:
- Génère EXACTEMENT 10 questions pour CHAQUE checkpoint (total: ${checkpoints.length * 10} questions)
- checkpointIndex va de 0 à ${checkpoints.length - 1}
- Chaque question a EXACTEMENT 4 choix (A, B, C, D)
- correctIndex est entre 0 et 3
- Questions de COMPRÉHENSION (pas juste de mémorisation)
- Explications détaillées (2-3 phrases)
- Tout en ${langName}

RÉPONDS EN JSON (pas de markdown, pas de commentaires):
{
  "questions": [
    {
      "question": "Question détaillée sur le checkpoint?",
      "choices": ["Choix A", "Choix B", "Choix C", "Choix D"],
      "correctIndex": 0,
      "explanation": "Explication détaillée de pourquoi cette réponse est correcte.",
      "checkpointIndex": 0
    }
  ]
}`

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 12000,
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
        await updateProgress(id, 'converting', `Téléchargement de ${doc.name}...`, 5, 240)
        
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

      console.log(`Total pages to process: ${totalPageCount}`)

      // Process each page: convert to image + transcribe with vision
      let processedPages = 0
      const allPageTranscriptions: string[] = []

      for (const doc of lessonDocs) {
        const docData = documentBuffers.get(doc.id)
        if (!docData) continue

        const { buffer, pageCount } = docData

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          const remainingPages = totalPageCount - processedPages
          const etaSeconds = Math.max(5, remainingPages * 3) // ~3s per page estimate

          // Convert to image
          await updateProgress(
            id, 
            'converting', 
            `Conversion page ${pageNum}/${pageCount} de ${doc.name}...`, 
            Math.round((processedPages / totalPageCount) * 40), // 0-40%
            etaSeconds
          )

          const imageResult = await convertPdfPageToImage(buffer, pageNum)
          
          if (!imageResult) {
            console.warn(`Image conversion failed for page ${pageNum}, skipping`)
            allPageTranscriptions.push(`Page ${pageNum} (conversion failed)`)
            processedPages++
            continue
          }

          // Upload image to storage
          const imagePath = `${id}/page-${pageNum}.png`
          await getSupabaseAdmin().storage
            .from('interactive-lessons')
            .upload(imagePath, imageResult.buffer, {
              contentType: 'image/png',
              upsert: true
            })

          // Store image record
          await getSupabaseAdmin()
            .from('interactive_lesson_page_images')
            .upsert({
              document_id: doc.id,
              page_number: pageNum,
              image_path: imagePath,
              width: imageResult.width,
              height: imageResult.height
            }, { onConflict: 'document_id,page_number' })

          // Transcribe with vision
          await updateProgress(
            id, 
            'transcribing', 
            `Transcription IA page ${pageNum}/${pageCount}...`, 
            Math.round(40 + (processedPages / totalPageCount) * 40), // 40-80%
            Math.max(5, remainingPages * 2)
          )

          const imageBase64 = imageResult.buffer.toString('base64')
          const transcription = await transcribePageWithVision(imageBase64, pageNum, lesson.language)
          
          allPageTranscriptions.push(transcription.text)

          // Store transcription
          const { data: pageText } = await getSupabaseAdmin()
            .from('interactive_lesson_page_texts')
            .upsert({
              document_id: doc.id,
              page_number: pageNum,
              text_content: transcription.text,
              transcription_type: 'vision',
              has_visual_content: transcription.hasVisualContent
            }, { onConflict: 'document_id,page_number' })
            .select()
            .single()

          // Store elements
          if (pageText && transcription.elements.length > 0) {
            for (const element of transcription.elements) {
              await getSupabaseAdmin()
                .from('interactive_lesson_page_elements')
                .insert({
                  page_text_id: pageText.id,
                  element_type: element.type,
                  element_text: element.term,
                  explanation: element.explanation,
                  element_order: 0
                })
            }
          }

          processedPages++
        }
      }

      // Analyze structure
      await updateProgress(id, 'analyzing', 'Analyse de la structure du cours...', 82, 30)
      const structure = await analyzeDocumentStructure(allPageTranscriptions, totalPageCount, lesson.language)
      
      console.log(`Found ${structure.checkpoints.length} checkpoints`)

      // Store reconstruction
      await getSupabaseAdmin()
        .from('interactive_lesson_reconstructions')
        .upsert({
          interactive_lesson_id: id,
          full_content: allPageTranscriptions.join('\n\n'),
          structure_json: structure
        }, { onConflict: 'interactive_lesson_id' })

      // Create checkpoints
      await updateProgress(id, 'checkpointing', 'Création des checkpoints...', 87, 20)

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
          
          // Legacy section
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

      // Generate questions
      await updateProgress(id, 'questions', 'Génération des questions...', 92, 15)
      const questions = await generateAllQuestions(structure.checkpoints, allPageTranscriptions, lesson.language)
      
      console.log(`Generated ${questions.length} questions for ${createdCheckpoints.length} checkpoints`)
      
      // Count questions per checkpoint for debugging
      const questionsPerCheckpoint = new Map<number, number>()
      questions.forEach(q => {
        questionsPerCheckpoint.set(q.checkpointIndex, (questionsPerCheckpoint.get(q.checkpointIndex) || 0) + 1)
      })
      questionsPerCheckpoint.forEach((count, idx) => {
        console.log(`Checkpoint ${idx}: ${count} questions`)
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
            console.error(`Failed to store question for checkpoint ${q.checkpointIndex}:`, insertError)
          }
        } else {
          console.warn(`No checkpoint found for checkpointIndex ${q.checkpointIndex}`)
        }
      }
      
      console.log(`Successfully stored ${storedCount}/${questions.length} questions`)

      // Complete
      const totalTime = Math.round((Date.now() - startTime) / 1000)
      await updateProgress(id, 'complete', `Terminé en ${totalTime}s !`, 100, 0)

      return NextResponse.json({ 
        success: true,
        duration: totalTime,
        pages: totalPageCount,
        checkpoints: structure.checkpoints.length,
        questions: questions.length
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
