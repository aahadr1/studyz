import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 120 // 2 minutes max - should be plenty now

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
type ProcessingStep = 'extracting' | 'analyzing' | 'checkpointing' | 'questions' | 'complete'

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

// STEP 1: Fast text extraction using pdf-parse
async function extractTextFast(buffer: Buffer): Promise<{ text: string; pageCount: number; pageTexts: string[] }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    
    const fullText = data.text || ''
    const pageCount = data.numpages || 1
    
    console.log(`Extracted ${fullText.length} chars from ${pageCount} pages`)
    
    // Split text roughly by page count for page-level storage
    const avgCharsPerPage = Math.ceil(fullText.length / pageCount)
    const pageTexts: string[] = []
    
    for (let i = 0; i < pageCount; i++) {
      const start = i * avgCharsPerPage
      const end = Math.min((i + 1) * avgCharsPerPage, fullText.length)
      pageTexts.push(fullText.slice(start, end).trim() || `Page ${i + 1}`)
    }
    
    return { text: fullText, pageCount, pageTexts }
  } catch (error) {
    console.error('pdf-parse error:', error)
    throw new Error('Impossible d\'extraire le texte du PDF')
  }
}

// STEP 2: Analyze document structure with ONE LLM call
interface DocumentStructure {
  checkpoints: Array<{
    title: string
    startPage: number
    endPage: number
    summary: string
    keyPoints: string[]
    importantTerms: Array<{ term: string; explanation: string }>
  }>
}

async function analyzeDocumentStructure(
  text: string, 
  pageCount: number, 
  language: string
): Promise<DocumentStructure> {
  const langName = language === 'fr' ? 'French' : language === 'en' ? 'English' : language
  
  // Truncate text if too long (GPT-4o-mini has 128k context)
  const maxChars = 100000
  const truncatedText = text.length > maxChars ? text.slice(0, maxChars) + '\n...[truncated]' : text

  const prompt = `Tu es un expert pédagogique. Analyse ce document de cours et structure-le en checkpoints pour un apprentissage progressif.

DOCUMENT (${pageCount} pages, en ${langName}):
${truncatedText}

INSTRUCTIONS:
1. Divise le contenu en 3-8 checkpoints logiques (chapitres/sections/thèmes)
2. Chaque checkpoint doit couvrir un concept cohérent que l'étudiant doit maîtriser
3. Pour chaque checkpoint, identifie:
   - Les pages concernées (start_page et end_page, 1-indexed)
   - Un titre clair
   - Un résumé de 2-3 phrases
   - 3-5 points clés à retenir
   - 3-5 termes importants avec leur explication

RÉPONDS UNIQUEMENT EN JSON (pas de markdown):
{
  "checkpoints": [
    {
      "title": "Titre du checkpoint",
      "startPage": 1,
      "endPage": 3,
      "summary": "Résumé concis...",
      "keyPoints": ["Point 1", "Point 2", "Point 3"],
      "importantTerms": [
        {"term": "Terme technique", "explanation": "Explication simple"}
      ]
    }
  ]
}`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 8000,
    temperature: 0.3,
  })

  const content = response.choices[0]?.message?.content || '{}'
  
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    
    // Validate and fix page numbers
    if (parsed.checkpoints) {
      parsed.checkpoints = parsed.checkpoints.map((cp: any, idx: number) => ({
        ...cp,
        startPage: Math.max(1, Math.min(cp.startPage || 1, pageCount)),
        endPage: Math.max(1, Math.min(cp.endPage || pageCount, pageCount)),
        keyPoints: cp.keyPoints || [],
        importantTerms: cp.importantTerms || []
      }))
    }
    
    return parsed
  } catch (error) {
    console.error('Failed to parse structure:', content)
    // Return default structure
    return {
      checkpoints: [{
        title: 'Contenu complet',
        startPage: 1,
        endPage: pageCount,
        summary: 'Document de cours',
        keyPoints: ['Étudier le contenu'],
        importantTerms: []
      }]
    }
  }
}

// STEP 3: Generate ALL questions in ONE batch call
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
  const langName = language === 'fr' ? 'French' : language === 'en' ? 'English' : language
  
  // Build checkpoint summaries for context
  const checkpointSummaries = checkpoints.map((cp, idx) => 
    `Checkpoint ${idx + 1}: "${cp.title}" - ${cp.summary} (Points: ${cp.keyPoints.join(', ')})`
  ).join('\n')

  const prompt = `Tu es un expert en création de QCM pédagogiques. Génère des questions pour tester la compréhension d'un cours.

CHECKPOINTS DU COURS:
${checkpointSummaries}

CONTENU DU COURS (${langName}):
${fullText.slice(0, 50000)}

INSTRUCTIONS:
- Génère 8-10 questions par checkpoint
- Chaque question a exactement 4 choix
- Un seul choix est correct (index 0-3)
- Les questions doivent tester la COMPRÉHENSION, pas la mémorisation
- Inclus des explications claires
- Questions en ${langName}

RÉPONDS UNIQUEMENT EN JSON (pas de markdown):
{
  "questions": [
    {
      "question": "Question?",
      "choices": ["Choix A", "Choix B", "Choix C", "Choix D"],
      "correctIndex": 0,
      "explanation": "Explication de la bonne réponse",
      "checkpointIndex": 0
    }
  ]
}`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 16000,
    temperature: 0.5,
  })

  const content = response.choices[0]?.message?.content || '{}'
  
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return parsed.questions || []
  } catch (error) {
    console.error('Failed to parse questions:', content)
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

    // Get lesson and verify ownership
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

    if (lesson.status === 'ready') {
      return NextResponse.json({ error: 'Already processed' }, { status: 400 })
    }

    const documents = lesson.interactive_lesson_documents || []
    const lessonDocs = documents.filter((d: any) => d.category === 'lesson')
    const mcqDocs = documents.filter((d: any) => d.category === 'mcq')

    const mode = lessonDocs.length > 0 ? 'document_based' : 'mcq_only'

    if (mode === 'mcq_only' && mcqDocs.length === 0) {
      return NextResponse.json({ error: 'No documents uploaded' }, { status: 400 })
    }

    // Start processing
    await getSupabaseAdmin()
      .from('interactive_lessons')
      .update({ 
        status: 'processing', 
        mode,
        processing_started_at: new Date().toISOString(),
        processing_step: 'extracting',
        processing_percent: 0,
        processing_message: 'Démarrage...',
        error_message: null
      })
      .eq('id', id)

    try {
      if (mode === 'document_based') {
        // ========== STEP 1: EXTRACT TEXT (~5s) ==========
        await updateProgress(id, 'extracting', 'Extraction du texte...', 5, 90)
        
        let fullText = ''
        let totalPages = 0
        const allPageTexts: string[] = []

        for (const doc of lessonDocs) {
          const { data: fileData, error: downloadError } = await getSupabaseAdmin().storage
            .from('interactive-lessons')
            .download(doc.file_path)

          if (downloadError || !fileData) {
            console.error('Download error:', downloadError)
            continue
          }

          const buffer = Buffer.from(await fileData.arrayBuffer())
          const { text, pageCount, pageTexts } = await extractTextFast(buffer)
          
          fullText += text + '\n\n'
          totalPages += pageCount
          allPageTexts.push(...pageTexts)

          // Update document page count
          await getSupabaseAdmin()
            .from('interactive_lesson_documents')
            .update({ page_count: pageCount })
            .eq('id', doc.id)
            
          // Store page texts
          for (let i = 0; i < pageTexts.length; i++) {
            await getSupabaseAdmin()
              .from('interactive_lesson_page_texts')
              .upsert({
                document_id: doc.id,
                page_number: i + 1,
                text_content: pageTexts[i],
                transcription_type: 'text'
              }, { onConflict: 'document_id,page_number' })
          }
        }

        if (!fullText.trim()) {
          throw new Error('Aucun texte extrait des documents')
        }

        await updateProgress(id, 'extracting', `${totalPages} pages extraites`, 15, 75)

        // ========== STEP 2: ANALYZE STRUCTURE (~30s) ==========
        await updateProgress(id, 'analyzing', 'Analyse de la structure...', 20, 60)
        
        const structure = await analyzeDocumentStructure(fullText, totalPages, lesson.language)
        
        console.log(`Found ${structure.checkpoints.length} checkpoints`)
        await updateProgress(id, 'analyzing', `${structure.checkpoints.length} checkpoints identifiés`, 40, 45)

        // ========== STEP 3: CREATE CHECKPOINTS (~10s) ==========
        await updateProgress(id, 'checkpointing', 'Création des checkpoints...', 45, 40)

        const createdCheckpoints: Array<{ id: string; index: number }> = []

        for (let i = 0; i < structure.checkpoints.length; i++) {
          const cp = structure.checkpoints[i]
          
          // Create checkpoint
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
            
            // Also create legacy section for backwards compatibility
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

            // Store important terms as page elements
            for (const term of cp.importantTerms || []) {
              // Find which page this term might be on
              const pageIdx = Math.min(cp.startPage - 1, allPageTexts.length - 1)
              
              // Get or create page text record
              const { data: pageText } = await getSupabaseAdmin()
                .from('interactive_lesson_page_texts')
                .select('id')
                .eq('document_id', lessonDocs[0]?.id)
                .eq('page_number', pageIdx + 1)
                .single()

              if (pageText) {
                await getSupabaseAdmin()
                  .from('interactive_lesson_page_elements')
                  .insert({
                    page_text_id: pageText.id,
                    element_type: 'term',
                    element_text: term.term,
                    explanation: term.explanation,
                    element_order: 0
                  })
              }
            }
          }
        }

        await updateProgress(id, 'checkpointing', `${createdCheckpoints.length} checkpoints créés`, 55, 30)

        // ========== STEP 4: GENERATE QUESTIONS (~30s) ==========
        await updateProgress(id, 'questions', 'Génération des questions...', 60, 25)

        const questions = await generateAllQuestions(structure.checkpoints, fullText, lesson.language)
        
        console.log(`Generated ${questions.length} questions`)
        await updateProgress(id, 'questions', `${questions.length} questions générées`, 85, 10)

        // Store questions
        for (const q of questions) {
          const checkpoint = createdCheckpoints.find(c => c.index === q.checkpointIndex)
          if (checkpoint) {
            await getSupabaseAdmin()
              .from('interactive_lesson_questions')
              .insert({
                checkpoint_id: checkpoint.id,
                question: q.question,
                choices: q.choices,
                correct_index: q.correctIndex,
                explanation: q.explanation,
                question_order: 0
              })
          }
        }

        // Store reconstruction for reference
        await getSupabaseAdmin()
          .from('interactive_lesson_reconstructions')
          .upsert({
            interactive_lesson_id: id,
            full_content: fullText.slice(0, 500000), // Limit size
            structure_json: structure
          }, { onConflict: 'interactive_lesson_id' })

      } else {
        // MCQ-only mode - simpler flow
        await updateProgress(id, 'extracting', 'Extraction des questions...', 10, 60)
        
        let mcqText = ''
        for (const doc of mcqDocs) {
          const { data: fileData } = await getSupabaseAdmin().storage
            .from('interactive-lessons')
            .download(doc.file_path)

          if (fileData) {
            const buffer = Buffer.from(await fileData.arrayBuffer())
            const { text } = await extractTextFast(buffer)
            mcqText += text + '\n'
          }
        }

        await updateProgress(id, 'analyzing', 'Analyse des questions...', 40, 30)
        
        // Parse MCQ from text
        const questions = await parseMcqFromText(mcqText, lesson.language)
        
        await updateProgress(id, 'checkpointing', 'Organisation...', 70, 15)
        
        // Group into sections
        const questionsPerSection = 10
        const sectionCount = Math.ceil(questions.length / questionsPerSection)

        for (let i = 0; i < sectionCount; i++) {
          const sectionQuestions = questions.slice(i * questionsPerSection, (i + 1) * questionsPerSection)
          
          const { data: checkpoint } = await getSupabaseAdmin()
            .from('interactive_lesson_checkpoints')
            .insert({
              interactive_lesson_id: id,
              checkpoint_order: i + 1,
              title: `Section ${i + 1}`,
              checkpoint_type: 'topic',
              start_page: 1,
              end_page: 1,
              summary: `${sectionQuestions.length} questions`,
              pass_threshold: 70
            })
            .select()
            .single()

          if (checkpoint) {
            for (let j = 0; j < sectionQuestions.length; j++) {
              const q = sectionQuestions[j]
              await getSupabaseAdmin()
                .from('interactive_lesson_questions')
                .insert({
                  checkpoint_id: checkpoint.id,
                  question: q.question,
                  choices: q.choices,
                  correct_index: q.correctIndex,
                  explanation: q.explanation,
                  question_order: j + 1
                })
            }
          }
        }
      }

      // ========== COMPLETE ==========
      const totalTime = Math.round((Date.now() - startTime) / 1000)
      await updateProgress(id, 'complete', `Terminé en ${totalTime}s !`, 100, 0)

      return NextResponse.json({ 
        success: true,
        duration: totalTime
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

// Helper: Parse MCQ from text
async function parseMcqFromText(text: string, language: string): Promise<Array<{ question: string; choices: string[]; correctIndex: number; explanation: string }>> {
  const prompt = `Extrais les QCM de ce texte. Pour chaque question, identifie les choix et la bonne réponse.

Texte:
${text.slice(0, 30000)}

RÉPONDS EN JSON:
{
  "questions": [
    {
      "question": "Question?",
      "choices": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "Pourquoi"
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
    return parsed.questions || []
  } catch {
    return []
  }
}
