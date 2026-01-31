import {
  DocumentContent,
  KnowledgeGraph,
  PodcastSegment,
  PodcastChapter,
  PredictedQuestion,
  VoiceProfile,
} from '@/types/intelligent-podcast'
import { getOpenAI } from './openai-client'

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
  const openai = getOpenAI()

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
  const openai = getOpenAI()

  const documentsSummary = documents
    .map((doc) => `Document: ${doc.title}\nContent: ${doc.content.slice(0, 3000)}`)
    .join('\n\n---\n\n')

  const conceptsSummary = knowledgeGraph.concepts
    .map((c) => `- ${c.name} (${c.difficulty}): ${c.description}`)
    .join('\n')

  const systemPrompt =
    config.language === 'fr'
      ? `Tu es un expert en création de contenu pédagogique sous forme de podcast.

Crée une structure en CHAPITRES pour un podcast de ${config.targetDuration} minutes.

STYLE : ${config.style}

RÈGLES :
1. Crée 3-6 chapitres selon la durée cible
2. Chaque chapitre doit avoir :
   - Un titre accrocheur
   - Un résumé concis
   - Une durée estimée (en secondes)
   - Les concepts principaux abordés
   - Un niveau de difficulté global
3. Structure logique : progression du simple au complexe
4. Équilibre entre les chapitres

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
1. Create 3-6 chapters based on target duration
2. Each chapter must have:
   - A catchy title
   - A concise summary
   - Estimated duration (in seconds)
   - Main concepts covered
   - Overall difficulty level
3. Logical structure: progress from simple to complex
4. Balance between chapters

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

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Documents:\n${documentsSummary}\n\nConcepts disponibles:\n${conceptsSummary}`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 4096,
    temperature: 0.7,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('Failed to generate chapters')
  }

  try {
    const parsed = JSON.parse(content)

    // Calculate start and end times for each chapter
    let cumulativeTime = 0
    const chapters: PodcastChapter[] = parsed.chapters.map((ch: any) => {
      const startTime = cumulativeTime
      const endTime = cumulativeTime + ch.estimatedDuration
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
  const openai = getOpenAI()

  const allSegments: PodcastSegment[] = []

  // Generate segments for each chapter
  for (const chapter of chapters) {
    console.log(`[Script] Generating segments for chapter: ${chapter.title}`)

    const chapterConcepts = knowledgeGraph.concepts.filter((c) => chapter.concepts.includes(c.id))

    const conceptsDescription = chapterConcepts
      .map((c) => `- ${c.name}: ${c.description}`)
      .join('\n')

    const systemPrompt =
      config.language === 'fr'
        ? `Tu es un scénariste expert en podcasts éducatifs conversationnels.

Crée une conversation NATURELLE et ENGAGEANTE pour ce chapitre.

INTERVENANTS :
${config.voiceProfiles.map((v) => `- ${v.role.toUpperCase()} (${v.name}): ${v.description}`).join('\n')}

RÈGLES CRITIQUES :
1. Alterne entre les 3 voix de manière naturelle
2. Chaque segment = 2-4 phrases maximum
3. Utilise des transitions naturelles ("Justement...", "C'est fascinant...", "Attends...")
4. Insère des "question breakpoints" toutes les 3-5 répliques (marque avec isQuestionBreakpoint: true)
5. Ajoute de la personnalité : réactions, questions, exemples concrets
6. Progression logique des concepts

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

Crée entre 15-25 segments pour couvrir tous les concepts du chapitre.`
        : `You are an expert scriptwriter for educational conversational podcasts.

Create a NATURAL and ENGAGING conversation for this chapter.

SPEAKERS:
${config.voiceProfiles.map((v) => `- ${v.role.toUpperCase()} (${v.name}): ${v.description}`).join('\n')}

CRITICAL RULES:
1. Alternate between the 3 voices naturally
2. Each segment = 2-4 sentences maximum
3. Use natural transitions ("Actually...", "That's fascinating...", "Wait...")
4. Insert "question breakpoints" every 3-5 exchanges (mark with isQuestionBreakpoint: true)
5. Add personality: reactions, questions, concrete examples
6. Logical progression of concepts

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

Create 15-25 segments to cover all chapter concepts.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Chapitre: ${chapter.title}\n\nRésumé: ${chapter.summary}\n\nConcepts à couvrir:\n${conceptsDescription}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      temperature: 0.8,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      console.error(`Failed to generate segments for chapter ${chapter.id}`)
      continue
    }

    try {
      const parsed = JSON.parse(content)
      const chapterSegments = parsed.segments || []

      // Calculate timestamps within the chapter
      const segmentDuration = (chapter.endTime - chapter.startTime) / chapterSegments.length
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
  const openai = getOpenAI()

  console.log('[Script] Generating predicted Q&A...')

  const contentSummary = documents
    .map((doc) => `${doc.title}: ${doc.content.slice(0, 2000)}`)
    .join('\n\n')

  const conceptsSummary = knowledgeGraph.concepts
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n')

  const systemPrompt =
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

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Contenu:\n${contentSummary}\n\nConcepts:\n${conceptsSummary}`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 8192,
    temperature: 0.7,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    return []
  }

  try {
    const parsed = JSON.parse(content)
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
