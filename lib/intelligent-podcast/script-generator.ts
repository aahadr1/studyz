import {
  DocumentContent,
  KnowledgeGraph,
  PodcastSegment,
  PodcastChapter,
  PredictedQuestion,
  VoiceProfile,
} from '@/types/intelligent-podcast'
import { parseJsonObject, runGemini3Flash } from './gemini-client'

interface ScriptGenerationResult {
  chapters: PodcastChapter[]
  segments: PodcastSegment[]
  predictedQuestions: PredictedQuestion[]
  title: string
  description: string
}

/**
 * Generate intelligent podcast script with chapters, segments, and predicted Q&A
 */
export async function generateIntelligentScript(
  documents: DocumentContent[],
  knowledgeGraph: KnowledgeGraph,
  config: {
    targetDuration: number // minutes
    language: string
    style: 'educational' | 'conversational' | 'technical' | 'storytelling'
    voiceProfiles: VoiceProfile[]
  }
): Promise<ScriptGenerationResult> {
  console.log('[Script] Starting intelligent script generation...')

  // Step 1: Generate high-level structure (chapters)
  const chaptersData = await generateChapters(documents, knowledgeGraph, config)

  // Step 2: Generate detailed segments for each chapter
  const segmentsData = await generateSegments(chaptersData.chapters, knowledgeGraph, config)

  // Step 3: Generate predicted questions with pre-generated answers
  const predictedQuestions = await generatePredictedQuestions(
    documents,
    knowledgeGraph,
    segmentsData.segments,
    config.language
  )

  console.log('[Script] Script generation completed successfully')

  return {
    chapters: chaptersData.chapters,
    segments: segmentsData.segments,
    predictedQuestions,
    title: chaptersData.title,
    description: chaptersData.description,
  }
}

/**
 * Generate chapter structure for the podcast
 */
async function generateChapters(
  documents: DocumentContent[],
  knowledgeGraph: KnowledgeGraph,
  config: { targetDuration: number; language: string; style: string }
): Promise<{ chapters: PodcastChapter[]; title: string; description: string }> {
  const targetSeconds = Math.max(1, Math.round((config.targetDuration || 1) * 60))
  const targetChapters = Math.min(10, Math.max(3, Math.round(config.targetDuration / 8))) // ~1 chapter per 8 min

  const documentsSummary = documents
    .map((doc) => `Document: ${doc.title}\nContent:\n${doc.content.slice(0, 20000)}`)
    .join('\n\n---\n\n')

  const conceptsSummary = knowledgeGraph.concepts
    .map((c) => `- ${c.name} (${c.difficulty}): ${c.description}`)
    .join('\n')

  const systemInstruction =
    config.language === 'fr'
      ? `Tu es un expert en création de contenu pédagogique sous forme de podcast.

Crée une structure en CHAPITRES pour un podcast de ${config.targetDuration} minutes.

STYLE : ${config.style}

RÈGLES :
1. Crée environ ${targetChapters} chapitres (minimum 3, maximum 10) selon la durée cible
2. Chaque chapitre doit avoir :
   - Un titre accrocheur
   - Un résumé concis
   - Une durée estimée (en secondes)
   - Les concepts principaux abordés
   - Un niveau de difficulté global
3. Structure logique : progression du simple au complexe
4. Équilibre entre les chapitres
5. IMPORTANT: La somme des "estimatedDuration" DOIT être proche de ${targetSeconds} secondes (±5%)

Retourne un objet json :
{
  "title": "Titre accrocheur du podcast",
  "description": "Description en 2-3 phrases",
  "chapters": [
    {
      "id": "chapter-1",
      "title": "Introduction : Les bases",
      "summary": "Résumé du chapitre",
      "estimatedDuration": 300,
      "concepts": ["concept-1", "concept-2"],
      "difficulty": "easy"
    }
  ]
}

IMPORTANT : Les IDs des concepts doivent correspondre à ceux fournis dans la liste.`
      : `You are an expert in creating educational podcast content.

Create a CHAPTER structure for a ${config.targetDuration}-minute podcast.

STYLE: ${config.style}

RULES:
1. Create about ${targetChapters} chapters (min 3, max 10) based on target duration
2. Each chapter must have:
   - A catchy title
   - A concise summary
   - Estimated duration (in seconds)
   - Main concepts covered
   - Overall difficulty level
3. Logical structure: progress from simple to complex
4. Balance between chapters
5. IMPORTANT: The sum of all "estimatedDuration" MUST be close to ${targetSeconds} seconds (±5%)

Return a json object:
{
  "title": "Catchy podcast title",
  "description": "Description in 2-3 sentences",
  "chapters": [
    {
      "id": "chapter-1",
      "title": "Introduction: The Basics",
      "summary": "Chapter summary",
      "estimatedDuration": 300,
      "concepts": ["concept-1", "concept-2"],
      "difficulty": "easy"
    }
  ]
}

IMPORTANT: Concept IDs must match those provided in the list.`

  try {
    const raw = await runGemini3Flash({
      prompt: `Documents:\n${documentsSummary}\n\nAvailable concepts:\n${conceptsSummary}`,
      systemInstruction,
      thinkingLevel: 'high',
      temperature: 0.6,
      topP: 0.95,
      maxOutputTokens: 8000,
    })
    const parsed = parseJsonObject<any>(raw)

    const rawChapters = Array.isArray(parsed.chapters) ? parsed.chapters : []
    const sanitized = rawChapters
      .map((ch: any, idx: number) => ({
        id: String(ch.id || `chapter-${idx + 1}`),
        title: String(ch.title || `Chapter ${idx + 1}`),
        summary: String(ch.summary || ''),
        estimatedDuration: Number.isFinite(ch.estimatedDuration) ? Math.max(30, Math.round(ch.estimatedDuration)) : 300,
        concepts: Array.isArray(ch.concepts) ? ch.concepts : [],
        difficulty: (ch.difficulty as any) || 'medium',
      }))
      .slice(0, 10)

    const totalEstimated = sanitized.reduce((sum: number, ch: any) => sum + ch.estimatedDuration, 0)
    const scale = totalEstimated > 0 ? targetSeconds / totalEstimated : 1

    // Calculate start/end times, scaled to match targetSeconds
    let cumulativeTime = 0
    const chapters: PodcastChapter[] = sanitized.map((ch: any, idx: number) => {
      const isLast = idx === sanitized.length - 1
      const scaled = Math.max(30, Math.round(ch.estimatedDuration * scale))
      const startTime = cumulativeTime
      const endTime = isLast ? targetSeconds : cumulativeTime + scaled
      cumulativeTime = endTime

      return {
        id: ch.id,
        title: ch.title,
        startTime,
        endTime,
        concepts: ch.concepts || [],
        difficulty: ch.difficulty || 'medium',
        summary: ch.summary || '',
      }
    })

    return {
      chapters,
      title: parsed.title || 'Podcast sans titre',
      description: parsed.description || '',
    }
  } catch (error) {
    console.error('Failed to parse chapters:', error)
    throw new Error('Failed to parse chapters')
  }
}

/**
 * Generate detailed conversation segments for all chapters
 */
async function generateSegments(
  chapters: PodcastChapter[],
  knowledgeGraph: KnowledgeGraph,
  config: { language: string; style: string; voiceProfiles: VoiceProfile[] }
): Promise<{ segments: PodcastSegment[] }> {
  const allSegments: PodcastSegment[] = []

  // Generate segments for each chapter
  for (const chapter of chapters) {
    console.log(`[Script] Generating segments for chapter: ${chapter.title}`)

    const chapterConcepts = knowledgeGraph.concepts.filter((c) => chapter.concepts.includes(c.id))

    const conceptsDescription = chapterConcepts
      .map((c) => `- ${c.name}: ${c.description}`)
      .join('\n')

    const chapterSeconds = Math.max(60, Math.round(chapter.endTime - chapter.startTime))
    const targetSegmentsForChapter = Math.min(
      18,
      Math.max(6, Math.round(chapterSeconds / 75)) // ~1 segment per 60-90s of audio
    )

    const systemPrompt =
      config.language === 'fr'
        ? `Tu es un scénariste expert en podcasts éducatifs conversationnels.

Crée une conversation NATURELLE, ENGAGEANTE et TRÈS DÉTAILLÉE pour ce chapitre.
Durée cible de ce chapitre: ~${chapterSeconds} secondes.

INTERVENANTS :
${config.voiceProfiles.map((v) => `- ${v.role.toUpperCase()} (${v.name}): ${v.description}`).join('\n')}

RÈGLES CRITIQUES :
1. Alterne entre les 3 voix de manière naturelle
2. Chaque segment doit être substantiel et instructif (viser ~120 à 190 mots par segment, soit ~45-75 secondes d'audio)
3. Utilise des transitions naturelles ("Justement...", "C'est fascinant...", "Attends...")
4. Insère des "question breakpoints" toutes les 3-5 répliques (marque avec isQuestionBreakpoint: true)
5. Ajoute de la personnalité : réactions, questions, exemples concrets, analogies, mini-récaps
6. Progression logique des concepts, du simple au complexe
7. Ne te contente pas de "réécrire" : explique, détaille, donne de la valeur pédagogique
8. Couvre TOUS les concepts du chapitre, sans en oublier

STRUCTURE DES SEGMENTS (json) :
{
  "segments": [
    {
      "speaker": "host",
      "text": "Bienvenue dans ce chapitre sur...",
      "concepts": ["concept-1"],
      "isQuestionBreakpoint": false,
      "difficulty": "easy"
    },
    {
      "speaker": "expert",
      "text": "Merci ! Ce concept est fascinant parce que...",
      "concepts": ["concept-1"],
      "isQuestionBreakpoint": false,
      "difficulty": "medium"
    },
    {
      "speaker": "simplifier",
      "text": "Pour simplifier, imaginez que...",
      "concepts": ["concept-1"],
      "isQuestionBreakpoint": true,
      "difficulty": "easy"
    }
  ]
}

Crée environ ${targetSegmentsForChapter} segments (min 6, max 18) pour couvrir tous les concepts du chapitre.`
        : `You are an expert scriptwriter for educational conversational podcasts.

Create a NATURAL, ENGAGING, and VERY DETAILED conversation for this chapter.
Target chapter duration: ~${chapterSeconds} seconds.

SPEAKERS:
${config.voiceProfiles.map((v) => `- ${v.role.toUpperCase()} (${v.name}): ${v.description}`).join('\n')}

CRITICAL RULES:
1. Alternate between the 3 voices naturally
2. Each segment must be substantial and instructive (aim ~120 to 190 words per segment, ~45-75 seconds of audio)
3. Use natural transitions ("Actually...", "That's fascinating...", "Wait...")
4. Insert "question breakpoints" every 3-5 exchanges (mark with isQuestionBreakpoint: true)
5. Add personality: reactions, questions, concrete examples, analogies, mini-recaps
6. Logical progression of concepts, from simple to complex
7. Don’t just paraphrase: teach, unpack, and add insight
8. Cover ALL chapter concepts (don’t skip any)

SEGMENT STRUCTURE (json format):
{
  "segments": [
    {
      "speaker": "host",
      "text": "Welcome to this chapter on...",
      "concepts": ["concept-1"],
      "isQuestionBreakpoint": false,
      "difficulty": "easy"
    },
    {
      "speaker": "expert",
      "text": "Thanks! This concept is fascinating because...",
      "concepts": ["concept-1"],
      "isQuestionBreakpoint": false,
      "difficulty": "medium"
    },
    {
      "speaker": "simplifier",
      "text": "To simplify, imagine that...",
      "concepts": ["concept-1"],
      "isQuestionBreakpoint": true,
      "difficulty": "easy"
    }
  ]
}

Create about ${targetSegmentsForChapter} segments (min 6, max 18) to cover all chapter concepts.`

    try {
      const raw = await runGemini3Flash({
        prompt: `Chapter: ${chapter.title}\n\nSummary: ${chapter.summary}\n\nConcepts to cover:\n${conceptsDescription}`,
        systemInstruction: systemPrompt,
        thinkingLevel: 'high',
        temperature: 0.75,
        topP: 0.95,
        maxOutputTokens: 20000,
      })
      const parsed = parseJsonObject<any>(raw)
      const chapterSegments = parsed.segments || []

      // Timestamps/durations will be recalculated later from audio duration,
      // but we still set placeholder values here.
      const segmentDuration = chapterSegments.length > 0 ? chapterSeconds / chapterSegments.length : 0
      let timestamp = chapter.startTime

      chapterSegments.forEach((seg: any, idx: number) => {
        allSegments.push({
          id: `${chapter.id}-segment-${idx}`,
          chapterId: chapter.id,
          speaker: seg.speaker || 'host',
          text: seg.text || '',
          duration: segmentDuration,
          timestamp,
          concepts: seg.concepts || [],
          isQuestionBreakpoint: seg.isQuestionBreakpoint || false,
          difficulty: seg.difficulty || 'medium',
        })
        timestamp += segmentDuration
      })
    } catch (error) {
      console.error(`Failed to parse segments for chapter ${chapter.id}:`, error)
    }
  }

  return { segments: allSegments }
}

/**
 * Generate predicted questions with pre-generated answers
 */
async function generatePredictedQuestions(
  documents: DocumentContent[],
  knowledgeGraph: KnowledgeGraph,
  segments: PodcastSegment[],
  language: string
): Promise<PredictedQuestion[]> {
  console.log('[Script] Generating predicted Q&A...')

  const contentSummary = documents
    .map((doc) => `${doc.title}: ${doc.content.slice(0, 12000)}`)
    .join('\n\n')

  const conceptsSummary = knowledgeGraph.concepts
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n')

  const systemInstruction =
    language === 'fr'
      ? `Tu es un expert en anticipation des questions des apprenants.

Génère 20 questions que les utilisateurs pourraient poser pendant l'écoute du podcast.

TYPES DE QUESTIONS :
1. Demandes de clarification ("Peux-tu expliquer X plus simplement ?")
2. Approfondissement ("Comment ça marche exactement ?")
3. Exemples concrets ("Donne-moi un exemple")
4. Liens avec autres concepts ("Quel est le lien avec Y ?")
5. Applications pratiques ("Comment utiliser ça ?")

Pour chaque question, fournis une réponse CONCISE (2-3 phrases max).

Retourne un objet json :
{
  "questions": [
    {
      "question": "Question complète de l'utilisateur",
      "answer": "Réponse concise et claire",
      "relevantConcepts": ["concept-1", "concept-2"]
    }
  ]
}

Varie les types de questions et couvre tous les concepts importants.`
      : `You are an expert in anticipating learner questions.

Generate 20 questions that users might ask while listening to the podcast.

QUESTION TYPES:
1. Clarification requests ("Can you explain X more simply?")
2. Deep dives ("How does this work exactly?")
3. Concrete examples ("Give me an example")
4. Links to other concepts ("What's the connection with Y?")
5. Practical applications ("How do I use this?")

For each question, provide a CONCISE answer (2-3 sentences max).

Return a json object:
{
  "questions": [
    {
      "question": "Complete user question",
      "answer": "Concise and clear answer",
      "relevantConcepts": ["concept-1", "concept-2"]
    }
  ]
}

Vary question types and cover all important concepts.`

  try {
    const raw = await runGemini3Flash({
      prompt: `Content:\n${contentSummary}\n\nConcepts:\n${conceptsSummary}`,
      systemInstruction,
      thinkingLevel: 'high',
      temperature: 0.6,
      topP: 0.95,
      maxOutputTokens: 12000,
    })
    const parsed = parseJsonObject<any>(raw)
    const questions = parsed.questions || []

    return questions.map((q: any, idx: number) => ({
      id: `predicted-q-${idx}`,
      question: q.question || '',
      answer: q.answer || '',
      relevantConcepts: q.relevantConcepts || [],
      relatedSegments: findRelatedSegments(q.relevantConcepts, segments),
    }))
  } catch (error) {
    console.error('Failed to parse predicted questions:', error)
    return []
  }
}

/**
 * Find segments related to specific concepts
 */
function findRelatedSegments(conceptIds: string[], segments: PodcastSegment[]): string[] {
  return segments
    .filter((seg) => seg.concepts.some((c) => conceptIds.includes(c)))
    .map((seg) => seg.id)
}
