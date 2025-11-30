import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getOpenAI } from '@/lib/openai'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await params

  try {
    console.log(`[ANALYZE-STRUCTURE] Fetching transcriptions from database for lesson ${lessonId}`)
    
    const supabase = getSupabaseServerClient()
    
    // Fetch all transcriptions from the database
    const { data: lessonDocs, error: docsError } = await (supabase as any)
      .from('interactive_lesson_documents')
      .select('id')
      .eq('interactive_lesson_id', lessonId)
      .eq('category', 'lesson')
    
    if (docsError || !lessonDocs || lessonDocs.length === 0) {
      return NextResponse.json(
        { error: 'No lesson documents found' },
        { status: 404 }
      )
    }

    const documentId = lessonDocs[0].id

    // Fetch all page transcriptions
    const { data: pageTexts, error: textsError } = await (supabase as any)
      .from('interactive_lesson_page_texts')
      .select('*')
      .eq('document_id', documentId)
      .order('page_number', { ascending: true })

    if (textsError || !pageTexts || pageTexts.length === 0) {
      return NextResponse.json(
        { error: 'No transcriptions found in database' },
        { status: 404 }
      )
    }

    console.log(`[ANALYZE-STRUCTURE] Found ${pageTexts.length} transcriptions in database`)
    
    // Convert to the format expected by the rest of the code
    const transcriptions = pageTexts.map((pt: any) => ({
      pageNumber: pt.page_number,
      text: pt.text_content
    }))

    const supabase = getSupabaseServerClient()
    const openai = getOpenAI()

    // Update progress
    await (supabase as any)
      .from('interactive_lessons')
      .update({
        processing_step: 'analyzing',
        processing_message: 'Analyse de la structure du cours...',
        processing_percent: 85
      })
      .eq('id', lessonId)

    // Combine all transcriptions
    const fullText = transcriptions
      .sort((a: any, b: any) => a.pageNumber - b.pageNumber)
      .map((t: any) => `Page ${t.pageNumber}:\n${t.text}`)
      .join('\n\n---\n\n')

    // Analyze structure with GPT-4o-mini
    const structureCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Tu es un expert pédagogique. Analyse ce cours et crée des sections logiques pour l'apprentissage progressif.
          
Chaque section doit couvrir un concept ou chapitre complet. Les sections doivent être cohérentes et faciliter l'apprentissage étape par étape.

Réponds UNIQUEMENT avec un objet JSON valide au format suivant (pas de texte avant ou après):
{
  "sections": [
    {
      "title": "Titre de la section",
      "startPage": 1,
      "endPage": 3,
      "summary": "Résumé du contenu de cette section"
    }
  ]
}

IMPORTANT: 
- Les numéros de page doivent correspondre aux pages réelles du document
- Chaque section doit avoir au moins 1 page
- Les sections ne doivent pas se chevaucher
- Crée entre 3 et 8 sections selon la longueur du cours`
        },
        {
          role: 'user',
          content: `Analyse ce cours et crée des sections pédagogiques:\n\n${fullText.substring(0, 20000)}`
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 3000
    })

    const structureText = structureCompletion.choices[0]?.message?.content
    if (!structureText) {
      throw new Error('No structure analysis received from AI')
    }

    const structure = JSON.parse(structureText)
    const sections = structure.sections || []

    if (sections.length === 0) {
      throw new Error('No sections created by AI')
    }

    console.log(`[ANALYZE-STRUCTURE] Created ${sections.length} sections`)

    // Update progress
    await (supabase as any)
      .from('interactive_lessons')
      .update({
        processing_step: 'checkpointing',
        processing_message: 'Création des sections et questions...',
        processing_percent: 90
      })
      .eq('id', lessonId)

    // Create sections in database
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]

      const { data: newSection, error: sectionError } = await (supabase as any)
        .from('interactive_lesson_sections')
        .insert({
          interactive_lesson_id: lessonId,
          title: section.title || `Section ${i + 1}`,
          start_page: section.startPage || 1,
          end_page: section.endPage || transcriptions.length,
          summary: section.summary || '',
          section_order: i
        })
        .select('id')
        .single()

      if (sectionError) {
        console.error(`[ANALYZE-STRUCTURE] Error creating section:`, sectionError)
        continue
      }

      // Generate 5 MCQs for this section
      const sectionPages = transcriptions.filter(
        (t: any) => t.pageNumber >= section.startPage && t.pageNumber <= section.endPage
      )
      const sectionText = sectionPages.map((t: any) => t.text).join('\n')

      try {
        const questionsCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Tu es un créateur de questions pédagogiques. Crée exactement 5 questions à choix multiples (QCM) sur ce contenu de cours.

Réponds UNIQUEMENT avec un objet JSON valide (pas de texte avant ou après):
{
  "questions": [
    {
      "question": "Quelle est la question?",
      "choices": ["Réponse A", "Réponse B", "Réponse C", "Réponse D"],
      "correct_index": 0,
      "explanation": "Explication de la bonne réponse"
    }
  ]
}

IMPORTANT:
- Exactement 5 questions
- 4 choix par question
- correct_index est entre 0 et 3
- Questions progressives en difficulté`
            },
            {
              role: 'user',
              content: `Crée 5 QCM sur: ${section.title}\n\nContenu:\n${sectionText.substring(0, 3000)}`
            }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 2000
        })

        const questionsText = questionsCompletion.choices[0]?.message?.content
        if (questionsText) {
          const questionsData = JSON.parse(questionsText)
          const questions = questionsData.questions || []

          for (let j = 0; j < Math.min(5, questions.length); j++) {
            const q = questions[j]
            await (supabase as any)
              .from('interactive_lesson_questions')
              .insert({
                section_id: newSection.id,
                question: q.question || `Question ${j + 1}`,
                choices: q.choices || ['A', 'B', 'C', 'D'],
                correct_index: q.correct_index ?? 0,
                explanation: q.explanation || '',
                question_order: j
              })
          }

          console.log(`[ANALYZE-STRUCTURE] ✓ Created ${questions.length} questions for section ${i + 1}`)
        }
      } catch (qError) {
        console.error(`[ANALYZE-STRUCTURE] Error generating questions for section ${i + 1}:`, qError)
      }
    }

    // Mark lesson as ready
    await (supabase as any)
      .from('interactive_lessons')
      .update({
        status: 'ready',
        processing_step: 'complete',
        processing_message: 'Leçon prête !',
        processing_percent: 100
      })
      .eq('id', lessonId)

    console.log(`[ANALYZE-STRUCTURE] ✓ Lesson ${lessonId} processing complete`)

    return NextResponse.json({
      success: true,
      sectionsCount: sections.length,
      message: 'Lesson structure analyzed and ready'
    })

  } catch (error: any) {
    console.error(`[ANALYZE-STRUCTURE] Error:`, error)

    // Update lesson to error status
    const supabase = getSupabaseServerClient()
    await (supabase as any)
      .from('interactive_lessons')
      .update({
        status: 'error',
        processing_message: `Erreur lors de l'analyse: ${error.message}`,
        processing_percent: 0
      })
      .eq('id', lessonId)

    return NextResponse.json(
      { error: error.message || 'Failed to analyze lesson structure' },
      { status: 500 }
    )
  }
}

