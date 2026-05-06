/**
 * Analyze Structure API
 * 
 * Analyzes the document structure and creates checkpoints with questions
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 120

// Lazy clients
let supabase: ReturnType<typeof createClient> | null = null
let openai: OpenAI | null = null

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabase
}

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  }
  return openai
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await params
  
  try {
    const { fullText, totalPages, language = 'fr' } = await request.json()
    
    if (!fullText) {
      return NextResponse.json(
        { error: 'Missing fullText' },
        { status: 400 }
      )
    }
    
    console.log(`[ANALYZE] Lesson ${lessonId}: ${fullText.length} chars, ${totalPages} pages`)
    
    const supabaseClient = getSupabase()
    const openaiClient = getOpenAI()
    
    // Update lesson status
    await (supabaseClient as any)
      .from('interactive_lessons')
      .update({
        processing_step: 'analyzing',
        processing_message: 'Analyse de la structure...',
        processing_percent: 85
      })
      .eq('id', lessonId)
    
    // ========== STEP 1: Analyze structure with AI ==========
    console.log('[ANALYZE] Analyzing document structure...')
    
    const truncatedText = fullText.length > 80000 ? fullText.slice(0, 80000) + '\n...[truncated]' : fullText
    
    const structurePrompt = language === 'fr'
      ? `Analyse ce cours de ${totalPages} pages et crée des checkpoints logiques.

TEXTE DU COURS:
${truncatedText}

Crée 3-6 checkpoints qui couvrent tout le cours.
Pour chaque checkpoint:
- title: Titre clair du chapitre/section
- startPage: Première page (1-${totalPages})
- endPage: Dernière page (1-${totalPages})
- summary: Résumé en 2-3 phrases
- keyPoints: Liste de 3-5 points clés

RÉPONDS EN JSON UNIQUEMENT:
{
  "checkpoints": [
    {
      "title": "...",
      "startPage": 1,
      "endPage": 3,
      "summary": "...",
      "keyPoints": ["...", "...", "..."]
    }
  ]
}`
      : `Analyze this ${totalPages}-page course and create logical checkpoints.

COURSE TEXT:
${truncatedText}

Create 3-6 checkpoints covering the entire course.
For each checkpoint:
- title: Clear chapter/section title
- startPage: First page (1-${totalPages})
- endPage: Last page (1-${totalPages})
- summary: 2-3 sentence summary
- keyPoints: List of 3-5 key points

RESPOND IN JSON ONLY:
{
  "checkpoints": [
    {
      "title": "...",
      "startPage": 1,
      "endPage": 3,
      "summary": "...",
      "keyPoints": ["...", "...", "..."]
    }
  ]
}`
    
    const structureResponse = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: structurePrompt }],
      max_tokens: 4000,
      temperature: 0.3
    })
    
    const structureContent = structureResponse.choices[0]?.message?.content || '{}'
    const structureCleaned = structureContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const structure = JSON.parse(structureCleaned)
    
    console.log(`[ANALYZE] Found ${structure.checkpoints?.length || 0} checkpoints`)
    
    // ========== STEP 2: Create checkpoints in DB ==========
    await (supabaseClient as any)
      .from('interactive_lessons')
      .update({
        processing_step: 'checkpointing',
        processing_message: 'Création des checkpoints...',
        processing_percent: 90
      })
      .eq('id', lessonId)
    
    // Delete existing checkpoints
    await (supabaseClient as any)
      .from('interactive_lesson_checkpoints')
      .delete()
      .eq('interactive_lesson_id', lessonId)
    
    // Create new checkpoints
    const checkpointIds: string[] = []
    
    for (let i = 0; i < (structure.checkpoints || []).length; i++) {
      const cp = structure.checkpoints[i]
      
      const { data: checkpoint, error } = await (supabaseClient as any)
        .from('interactive_lesson_checkpoints')
        .insert({
          interactive_lesson_id: lessonId,
          title: cp.title,
          summary: cp.summary,
          start_page: cp.startPage,
          end_page: cp.endPage,
          key_points: cp.keyPoints,
          order_index: i,
          pass_threshold: 70
        })
        .select()
        .single()
      
      if (checkpoint) {
        checkpointIds.push(checkpoint.id)
        console.log(`[ANALYZE] Created checkpoint ${i + 1}: ${cp.title}`)
      }
    }
    
    // ========== STEP 3: Generate questions for each checkpoint ==========
    await (supabaseClient as any)
      .from('interactive_lessons')
      .update({
        processing_step: 'questions',
        processing_message: 'Génération des questions...',
        processing_percent: 95
      })
      .eq('id', lessonId)
    
    console.log('[ANALYZE] Generating questions...')
    
    const questionsPrompt = language === 'fr'
      ? `Génère EXACTEMENT 10 QCM pour CHAQUE checkpoint de ce cours.

CHECKPOINTS:
${structure.checkpoints?.map((cp: any, i: number) => 
  `${i + 1}. "${cp.title}" (pages ${cp.startPage}-${cp.endPage}): ${cp.summary}`
).join('\n')}

CONTENU DU COURS:
${truncatedText.slice(0, 40000)}

INSTRUCTIONS:
- 10 questions par checkpoint (total: ${(structure.checkpoints?.length || 1) * 10} questions)
- 4 choix par question
- correctIndex entre 0 et 3
- Questions de compréhension variées

RÉPONDS EN JSON:
{
  "questions": [
    {
      "checkpointIndex": 0,
      "question": "Question détaillée?",
      "choices": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "Explication..."
    }
  ]
}`
      : `Generate EXACTLY 10 MCQs for EACH checkpoint of this course.

CHECKPOINTS:
${structure.checkpoints?.map((cp: any, i: number) => 
  `${i + 1}. "${cp.title}" (pages ${cp.startPage}-${cp.endPage}): ${cp.summary}`
).join('\n')}

COURSE CONTENT:
${truncatedText.slice(0, 40000)}

INSTRUCTIONS:
- 10 questions per checkpoint (total: ${(structure.checkpoints?.length || 1) * 10} questions)
- 4 choices per question
- correctIndex between 0 and 3
- Varied comprehension questions

RESPOND IN JSON:
{
  "questions": [
    {
      "checkpointIndex": 0,
      "question": "Detailed question?",
      "choices": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "Explanation..."
    }
  ]
}`
    
    const questionsResponse = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: questionsPrompt }],
      max_tokens: 16000,
      temperature: 0.5
    })
    
    const questionsContent = questionsResponse.choices[0]?.message?.content || '{}'
    const questionsCleaned = questionsContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const questionsData = JSON.parse(questionsCleaned)
    
    // Save questions to DB
    let totalQuestions = 0
    for (const q of (questionsData.questions || [])) {
      const checkpointId = checkpointIds[q.checkpointIndex]
      if (!checkpointId) continue
      
      await (supabaseClient as any)
        .from('interactive_lesson_questions')
        .insert({
          checkpoint_id: checkpointId,
          question_text: q.question,
          question_type: 'mcq',
          options: q.choices,
          correct_answer: q.correctIndex,
          explanation: q.explanation
        })
      
      totalQuestions++
    }
    
    console.log(`[ANALYZE] Created ${totalQuestions} questions`)
    
    // ========== COMPLETE ==========
    await (supabaseClient as any)
      .from('interactive_lessons')
      .update({
        status: 'ready',
        processing_step: 'complete',
        processing_message: 'Terminé !',
        processing_percent: 100
      })
      .eq('id', lessonId)
    
    console.log(`[ANALYZE] ✓ Complete for lesson ${lessonId}`)
    
    return NextResponse.json({
      success: true,
      checkpoints: structure.checkpoints?.length || 0,
      questions: totalQuestions
    })
    
  } catch (error) {
    console.error('[ANALYZE] Error:', error)
    
    // Update lesson with error
    const supabaseClient = getSupabase()
    await (supabaseClient as any)
      .from('interactive_lessons')
      .update({
        status: 'error',
        error_message: error instanceof Error ? error.message : 'Analysis failed'
      })
      .eq('id', lessonId)
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    )
  }
}

