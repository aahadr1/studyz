import { NextRequest, NextResponse } from 'next/server'
import { pdfToPng } from 'pdf-to-png-converter'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getOpenAI } from '@/lib/openai'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await params

  try {
    console.log(`[PROCESS-VISION] Starting processing for lesson: ${lessonId}`)
    
    const supabase = getSupabaseServerClient()
    const openai = getOpenAI()

    // 1. Récupérer les documents de la leçon
    const { data: documents, error: docsError } = await (supabase as any)
      .from('interactive_lesson_documents')
      .select('id, name, file_path, file_type')
      .eq('interactive_lesson_id', lessonId)
      .eq('category', 'lesson')

    if (docsError || !documents || documents.length === 0) {
      throw new Error(`Aucun document trouvé pour cette leçon. Veuillez uploader au moins un fichier PDF.`)
    }

    console.log(`[PROCESS-VISION] Found ${documents.length} documents`)

    // Validate that all documents are PDFs
    const nonPdfDocs = documents.filter((doc: any) => !doc.file_path.toLowerCase().endsWith('.pdf'))
    if (nonPdfDocs.length > 0) {
      throw new Error(`Certains fichiers ne sont pas des PDF: ${nonPdfDocs.map((d: any) => d.name).join(', ')}`)
    }

    let totalProcessedPages = 0
    const allTranscriptions: Array<{pageNumber: number, text: string, docId: string}> = []

    // 2. Pour chaque document PDF
    for (const doc of documents) {
      if (!doc.file_path.endsWith('.pdf')) {
        console.log(`[PROCESS-VISION] Skipping non-PDF: ${doc.name}`)
        continue
      }

      console.log(`[PROCESS-VISION] Processing document: ${doc.name}`)

      // Télécharger le PDF
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from('interactive-lessons')
        .download(doc.file_path)

      if (downloadError || !pdfData) {
        throw new Error(`Failed to download PDF ${doc.name}: ${downloadError?.message}`)
      }

      console.log(`[PROCESS-VISION] Downloaded PDF: ${pdfData.size} bytes`)

      // Convertir en ArrayBuffer
      const arrayBuffer = await pdfData.arrayBuffer()

      // Convertir PDF → PNG avec pdf-to-png-converter (en arrière-plan)
      console.log(`[PROCESS-VISION] Converting PDF to PNG pages...`)
      const pngPages = await pdfToPng(arrayBuffer, {
        viewportScale: 2.0, // Bonne résolution pour OCR
      })

      console.log(`[PROCESS-VISION] Converted ${pngPages.length} pages`)

      // 3. Traiter chaque page (conversion + transcription)
      for (let i = 0; i < pngPages.length; i++) {
        const page = pngPages[i]
        if (!page.content) {
          console.warn(`[PROCESS-VISION] Skipping page ${page.pageNumber} - no content`)
          continue
        }

        const localPageNumber = page.pageNumber
        const globalPageNumber = totalProcessedPages + localPageNumber

        try {
          // Mettre à jour le statut avec la page en cours
          await (supabase as any)
            .from('interactive_lessons')
            .update({
              processing_message: `Transcription IA page ${globalPageNumber}...`,
              processing_percent: Math.round((globalPageNumber / (pngPages.length * documents.length)) * 80), // 0-80% pour transcription
              processing_progress: globalPageNumber,
              processing_total: pngPages.length * documents.length
            })
            .eq('id', lessonId)

          console.log(`[PROCESS-VISION] Processing page ${globalPageNumber}/${pngPages.length * documents.length}`)

          // Convertir Buffer en base64
          const base64Image = page.content.toString('base64')

          // Appeler GPT-4o-mini vision
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'Tu es un expert en transcription de documents. Tu dois extraire tout le texte visible dans cette image de page de document, en préservant la structure et les sauts de ligne. Décris aussi brièvement les éléments visuels (diagrammes, tableaux, images) s\'il y en a.'
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Transcris cette page ${localPageNumber} de document en français :`
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/png;base64,${base64Image}`,
                      detail: 'high'
                    }
                  }
                ]
              }
            ],
            max_tokens: 4000
          })

          const transcription = completion.choices[0]?.message?.content || ''
          
          // Sauvegarder la transcription
          await (supabase as any)
            .from('interactive_lesson_page_texts')
            .upsert({
              document_id: doc.id,
              page_number: localPageNumber,
              text_content: transcription,
              transcription_type: 'vision',
              has_visual_content: transcription.includes('diagramme') || transcription.includes('tableau') || transcription.includes('image')
            }, { onConflict: 'document_id,page_number' })

          allTranscriptions.push({
            pageNumber: globalPageNumber,
            text: transcription,
            docId: doc.id
          })

          console.log(`[PROCESS-VISION] ✓ Transcribed page ${globalPageNumber}: ${transcription.length} chars`)
        } catch (pageError) {
          console.error(`[PROCESS-VISION] Error processing page ${globalPageNumber}:`, pageError)
          // Continue with other pages even if one fails
          allTranscriptions.push({
            pageNumber: globalPageNumber,
            text: `[Erreur lors du traitement de cette page]`,
            docId: doc.id
          })
        }
      }

      totalProcessedPages += pngPages.length
    }

    // 4. Analyser la structure et créer les checkpoints
    await (supabase as any)
      .from('interactive_lessons')
      .update({
        processing_step: 'analyzing',
        processing_message: 'Analyse de la structure du cours...',
        processing_percent: 80
      })
      .eq('id', lessonId)

    if (allTranscriptions.length > 0) {
      // Combiner tout le texte
      const fullText = allTranscriptions
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map(t => `Page ${t.pageNumber}:\n${t.text}`)
        .join('\n\n---\n\n')

      // Analyser la structure avec GPT-4o-mini
      const structureCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Tu es un expert pédagogique. Analyse ce cours et crée des sections logiques pour l\'apprentissage. Chaque section doit couvrir un concept ou chapitre complet. Réponds uniquement avec un JSON valide au format: {"sections": [{"title": "Titre", "startPage": 1, "endPage": 3, "summary": "Résumé"}]}'
          },
          {
            role: 'user',
            content: `Analyse ce cours et crée des sections pédagogiques :\n\n${fullText.substring(0, 15000)}`
          }
        ],
        max_tokens: 2000
      })

      const structureText = structureCompletion.choices[0]?.message?.content || ''
      
      try {
        const structure = JSON.parse(structureText)
        
        // Créer les sections
        if (structure.sections && Array.isArray(structure.sections)) {
          await (supabase as any)
            .from('interactive_lessons')
            .update({
              processing_step: 'checkpointing',
              processing_message: 'Création des sections...',
              processing_percent: 90
            })
            .eq('id', lessonId)

          for (let i = 0; i < structure.sections.length; i++) {
            const section = structure.sections[i]
            
            const { data: insertedSection } = await (supabase as any)
              .from('interactive_lesson_sections')
              .insert({
                interactive_lesson_id: lessonId,
                title: section.title || `Section ${i + 1}`,
                start_page: section.startPage || 1,
                end_page: section.endPage || totalProcessedPages,
                summary: section.summary || '',
                section_order: i
              })
              .select('id')
              .single()

            // Générer 5 questions pour cette section
            if (insertedSection) {
              const questionsCompletion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content: 'Crée exactement 5 questions QCM sur ce contenu. Réponds avec un JSON: {"questions": [{"question": "Question?", "choices": ["A", "B", "C", "D"], "correct_index": 0, "explanation": "Explication"}]}'
                  },
                  {
                    role: 'user',
                    content: `Crée 5 QCM sur: ${section.title}\n\nContenu:\n${section.summary}`
                  }
                ],
                max_tokens: 2000
              })

              const questionsText = questionsCompletion.choices[0]?.message?.content || ''
              
              try {
                const questionsData = JSON.parse(questionsText)
                if (questionsData.questions && Array.isArray(questionsData.questions)) {
                  for (let j = 0; j < Math.min(5, questionsData.questions.length); j++) {
                    const q = questionsData.questions[j]
                    await (supabase as any)
                      .from('interactive_lesson_questions')
                      .insert({
                        section_id: insertedSection.id,
                        question: q.question || `Question ${j + 1}`,
                        choices: q.choices || ['A', 'B', 'C', 'D'],
                        correct_index: q.correct_index || 0,
                        explanation: q.explanation || '',
                        question_order: j
                      })
                  }
                }
              } catch (e) {
                console.warn(`[PROCESS-VISION] Failed to parse questions for section ${i}:`, e)
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[PROCESS-VISION] Failed to parse structure:`, e)
      }
    }

    // 5. Finaliser
    await (supabase as any)
      .from('interactive_lessons')
      .update({
        status: 'ready',
        processing_step: 'complete',
        processing_message: 'Leçon prête !',
        processing_percent: 100
      })
      .eq('id', lessonId)

    console.log(`[PROCESS-VISION] ✓ Processing complete for lesson ${lessonId}`)

    return NextResponse.json({ 
      success: true, 
      totalPages: totalProcessedPages,
      message: 'Leçon traitée avec succès !' 
    })

  } catch (error) {
    console.error(`[PROCESS-VISION] Error processing lesson ${lessonId}:`, error)
    
    // Mettre à jour le statut d'erreur
    const supabase = getSupabaseServerClient()
    await (supabase as any)
      .from('interactive_lessons')
      .update({
        status: 'error',
        processing_step: 'error',
        processing_message: `Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
        processing_percent: 0
      })
      .eq('id', lessonId)

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erreur de traitement' 
      },
      { status: 500 }
    )
  }
}
