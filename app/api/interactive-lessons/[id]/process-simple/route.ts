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
    console.log(`[PROCESS-SIMPLE] Starting processing for lesson: ${lessonId}`)
    
    const supabase = getSupabaseServerClient()
    const openai = getOpenAI()

    // 1. Récupérer les documents de la leçon
    const { data: documents, error: docsError } = await (supabase as any)
      .from('interactive_lesson_documents')
      .select('id, name, file_path, file_type')
      .eq('interactive_lesson_id', lessonId)
      .eq('category', 'lesson')

    if (docsError || !documents || documents.length === 0) {
      throw new Error(`No lesson documents found: ${docsError?.message}`)
    }

    console.log(`[PROCESS-SIMPLE] Found ${documents.length} documents`)

    let totalPages = 0

    // 2. Pour chaque document PDF
    for (const doc of documents) {
      if (!doc.file_path.endsWith('.pdf')) {
        console.log(`[PROCESS-SIMPLE] Skipping non-PDF: ${doc.name}`)
        continue
      }

      console.log(`[PROCESS-SIMPLE] Processing document: ${doc.name}`)

      // Mettre à jour le statut
      await (supabase as any)
        .from('interactive_lessons')
        .update({
          processing_step: 'converting',
          processing_message: `Conversion de ${doc.name}...`,
          processing_percent: 10
        })
        .eq('id', lessonId)

      // Télécharger le PDF
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from('interactive-lessons')
        .download(doc.file_path)

      if (downloadError || !pdfData) {
        throw new Error(`Failed to download PDF ${doc.name}: ${downloadError?.message}`)
      }

      console.log(`[PROCESS-SIMPLE] Downloaded PDF: ${pdfData.size} bytes`)

      // Convertir en ArrayBuffer
      const arrayBuffer = await pdfData.arrayBuffer()

      // Convertir PDF → PNG avec pdf-to-png-converter
      console.log(`[PROCESS-SIMPLE] Converting PDF to PNG pages...`)
      const pngPages = await pdfToPng(arrayBuffer, {
        viewportScale: 2.0, // Bonne résolution pour OCR
      })

      console.log(`[PROCESS-SIMPLE] Converted ${pngPages.length} pages`)

      // Mettre à jour le statut
      await (supabase as any)
        .from('interactive_lessons')
        .update({
          processing_step: 'uploading',
          processing_message: `Sauvegarde des images de ${doc.name}...`,
          processing_percent: 30
        })
        .eq('id', lessonId)

      // 3. Sauvegarder chaque page en tant qu'image
      const pagePromises = []
      for (const page of pngPages) {
        if (!page.content) continue

        const pageNumber = totalPages + page.pageNumber
        const storagePath = `${lessonId}/${doc.id}/page-${page.pageNumber}.png`

        // Upload vers Supabase Storage
        const uploadPromise = supabase.storage
          .from('interactive-lessons')
          .upload(storagePath, page.content, {
            contentType: 'image/png',
            upsert: true
          })
          .then(({ error }) => {
            if (error) throw error
            
            // Créer l'enregistrement en DB
            return (supabase as any)
              .from('interactive_lesson_page_images')
              .upsert({
                document_id: doc.id,
                page_number: page.pageNumber,
                image_path: storagePath,
                width: page.width || 0,
                height: page.height || 0
              }, { onConflict: 'document_id,page_number' })
          })
          .then(() => {
            console.log(`[PROCESS-SIMPLE] ✓ Saved page ${pageNumber}`)
            return { pageNumber, storagePath, docId: doc.id, localPageNumber: page.pageNumber }
          })

        pagePromises.push(uploadPromise)
      }

      const savedPages = await Promise.all(pagePromises)
      totalPages += pngPages.length

      // Mettre à jour le statut
      await (supabase as any)
        .from('interactive_lessons')
        .update({
          processing_step: 'transcribing',
          processing_message: `Transcription IA de ${doc.name}...`,
          processing_percent: 50
        })
        .eq('id', lessonId)

      // 4. Transcrire chaque page avec GPT-4o-mini
      const transcriptionPromises = []
      for (const { pageNumber, storagePath, docId, localPageNumber } of savedPages) {
        const transcribePromise = (async () => {
          // Obtenir l'URL publique de l'image
          const { data: { publicUrl } } = supabase.storage
            .from('interactive-lessons')
            .getPublicUrl(storagePath)

          console.log(`[PROCESS-SIMPLE] Transcribing page ${pageNumber}...`)

          // Appeler GPT-4o-mini
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
                      url: publicUrl,
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
              document_id: docId,
              page_number: localPageNumber,
              text_content: transcription,
              transcription_type: 'vision',
              has_visual_content: transcription.includes('diagramme') || transcription.includes('tableau') || transcription.includes('image')
            }, { onConflict: 'document_id,page_number' })

          console.log(`[PROCESS-SIMPLE] ✓ Transcribed page ${pageNumber}: ${transcription.length} chars`)
          return transcription
        })()

        transcriptionPromises.push(transcribePromise)
      }

      await Promise.all(transcriptionPromises)
    }

    // 5. Analyser la structure et créer les checkpoints
    await (supabase as any)
      .from('interactive_lessons')
      .update({
        processing_step: 'analyzing',
        processing_message: 'Analyse de la structure du cours...',
        processing_percent: 80
      })
      .eq('id', lessonId)

    // Récupérer toutes les transcriptions
    const { data: allTexts } = await (supabase as any)
      .from('interactive_lesson_page_texts')
      .select('page_number, text_content, document_id')
      .in('document_id', documents.map(d => d.id))
      .order('document_id, page_number')

    if (allTexts && allTexts.length > 0) {
      // Combiner tout le texte
      const fullText = allTexts
        .map(t => `Page ${t.page_number}:\n${t.text_content}`)
        .join('\n\n---\n\n')

      // Analyser la structure avec GPT-4o-mini
      const structureCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Tu es un expert pédagogique. Analyse ce cours et crée des checkpoints logiques pour l\'apprentissage. Chaque checkpoint doit couvrir un concept ou chapitre complet. Réponds uniquement avec un JSON valide au format: {"checkpoints": [{"title": "Titre", "startPage": 1, "endPage": 3, "summary": "Résumé"}]}'
          },
          {
            role: 'user',
            content: `Analyse ce cours et crée des checkpoints pédagogiques :\n\n${fullText.substring(0, 15000)}`
          }
        ],
        max_tokens: 2000
      })

      const structureText = structureCompletion.choices[0]?.message?.content || ''
      
      try {
        const structure = JSON.parse(structureText)
        
        // Créer les checkpoints
        if (structure.checkpoints && Array.isArray(structure.checkpoints)) {
          for (let i = 0; i < structure.checkpoints.length; i++) {
            const checkpoint = structure.checkpoints[i]
            
            const { data: insertedCheckpoint } = await (supabase as any)
              .from('interactive_lesson_checkpoints')
              .insert({
                interactive_lesson_id: lessonId,
                title: checkpoint.title || `Checkpoint ${i + 1}`,
                start_page: checkpoint.startPage || 1,
                end_page: checkpoint.endPage || totalPages,
                summary: checkpoint.summary || '',
                order: i
              })
              .select('id')
              .single()

            // Générer 10 questions pour ce checkpoint
            if (insertedCheckpoint) {
              const questionsCompletion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content: 'Crée exactement 10 questions QCM sur ce contenu. Réponds avec un JSON: {"questions": [{"question": "Question?", "options": ["A", "B", "C", "D"], "correct": 0, "explanation": "Explication"}]}'
                  },
                  {
                    role: 'user',
                    content: `Crée 10 QCM sur: ${checkpoint.title}\n\nContenu:\n${checkpoint.summary}`
                  }
                ],
                max_tokens: 3000
              })

              const questionsText = questionsCompletion.choices[0]?.message?.content || ''
              
              try {
                const questionsData = JSON.parse(questionsText)
                if (questionsData.questions && Array.isArray(questionsData.questions)) {
                  for (let j = 0; j < Math.min(10, questionsData.questions.length); j++) {
                    const q = questionsData.questions[j]
                    await (supabase as any)
                      .from('interactive_lesson_questions')
                      .insert({
                        checkpoint_id: insertedCheckpoint.id,
                        question: q.question || `Question ${j + 1}`,
                        options: q.options || ['A', 'B', 'C', 'D'],
                        correct_answer: q.correct || 0,
                        explanation: q.explanation || '',
                        order: j
                      })
                  }
                }
              } catch (e) {
                console.warn(`[PROCESS-SIMPLE] Failed to parse questions for checkpoint ${i}:`, e)
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[PROCESS-SIMPLE] Failed to parse structure:`, e)
      }
    }

    // 6. Finaliser
    await (supabase as any)
      .from('interactive_lessons')
      .update({
        status: 'ready',
        processing_step: 'complete',
        processing_message: 'Leçon prête !',
        processing_percent: 100
      })
      .eq('id', lessonId)

    console.log(`[PROCESS-SIMPLE] ✓ Processing complete for lesson ${lessonId}`)

    return NextResponse.json({ 
      success: true, 
      totalPages,
      message: 'Leçon traitée avec succès !' 
    })

  } catch (error) {
    console.error(`[PROCESS-SIMPLE] Error processing lesson ${lessonId}:`, error)
    
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
