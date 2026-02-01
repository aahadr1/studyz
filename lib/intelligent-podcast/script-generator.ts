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

function countWords(text: string): number {
  const t = String(text || '').trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
}

function estimateMinutesFromWords(words: number, wpm: number = 150): number {
  const safeWpm = Number.isFinite(wpm) && wpm > 50 ? wpm : 150
  return words / safeWpm
}

function estimateScriptMetrics(segments: PodcastSegment[]) {
  const totalWords = segments.reduce((sum, s) => sum + countWords(s.text), 0)
  const estimatedMinutes = estimateMinutesFromWords(totalWords, 150)
  const avgWordsPerSegment = segments.length > 0 ? totalWords / segments.length : 0
  return { totalWords, estimatedMinutes, avgWordsPerSegment }
}

type RawSegment = {
  speaker?: string
  text?: string
  concepts?: string[]
  isQuestionBreakpoint?: boolean
  difficulty?: 'easy' | 'medium' | 'hard'
}

function sanitizeSpeaker(speaker: any): 'host' | 'expert' | 'simplifier' {
  const v = String(speaker || '').toLowerCase().trim()
  if (v === 'expert') return 'expert'
  if (v === 'simplifier') return 'simplifier'
  return 'host'
}

function sanitizeDifficulty(d: any): 'easy' | 'medium' | 'hard' {
  const v = String(d || '').toLowerCase().trim()
  if (v === 'easy') return 'easy'
  if (v === 'hard') return 'hard'
  return 'medium'
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
    userPrompt?: string
  }
): Promise<ScriptGenerationResult> {
  console.log('[Script] Starting intelligent script generation...')

  // Step 1: Generate high-level structure (chapters)
  const chaptersData = await generateChapters(documents, knowledgeGraph, config)

  // Step 2: Generate detailed segments for each chapter
  const segmentsData = await generateSegments(chaptersData.chapters, knowledgeGraph, config)

  const metrics = estimateScriptMetrics(segmentsData.segments)
  console.log(
    `[Script] Segments: ${segmentsData.segments.length}, words: ${metrics.totalWords}, estimated minutes: ${metrics.estimatedMinutes.toFixed(
      1
    )}, avg words/segment: ${metrics.avgWordsPerSegment.toFixed(1)}`
  )

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
  config: { targetDuration: number; language: string; style: string; userPrompt?: string }
): Promise<{ chapters: PodcastChapter[]; title: string; description: string }> {
  const targetSeconds = Math.max(1, Math.round((config.targetDuration || 1) * 60))
  // Allow more chapters for longer content, with better scaling
  const baseChaptersFor60Min = 8 // ~7.5 min per chapter for 60min content
  const targetChapters = Math.max(3, Math.round(config.targetDuration / 7.5)) // ~1 chapter per 7.5 min, no upper limit

  const documentsSummary = documents
    // Provide more source material; Gemini has a large context window.
    .map((doc) => `Document: ${doc.title}\nContent:\n${doc.content.slice(0, 200000)}`)
    .join('\n\n---\n\n')

  const conceptsSummary = knowledgeGraph.concepts
    .map((c) => `- ${c.name} (${c.difficulty}): ${c.description}`)
    .join('\n')

  const systemInstruction =
    config.language === 'fr'
      ? `Tu es un expert en création de contenu pédagogique sous forme de podcast.

DEMANDE UTILISATEUR (à respecter au maximum) :
${String(config.userPrompt || '').trim() || '(aucune demande spécifique)'}

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
6. IMPORTANT: Ce podcast est LONG-FORM. Planifie assez de chapitres pour développer en profondeur : définitions, intuition, exemples, erreurs fréquentes, applications.

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

USER DEMAND (follow as closely as possible):
${String(config.userPrompt || '').trim() || '(no specific demand)'}

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
6. IMPORTANT: This is LONG-FORM content. Plan enough room for depth: definitions, intuition, examples, common mistakes, applications.

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

  let raw: string
  try {
    raw = await runGemini3Flash({
      prompt: `Documents:\n${documentsSummary}\n\nAvailable concepts:\n${conceptsSummary}`,
      systemInstruction,
      thinkingLevel: 'high',
      temperature: 0.6,
      topP: 0.95,
      maxOutputTokens: 8000,
    })
  } catch (err) {
    console.error('Failed to generate chapters (LLM call):', err)
    throw new Error('Failed to generate chapters')
  }

  let parsed: { title?: string; description?: string; chapters?: any[] }
  try {
    parsed = parseJsonObject<any>(raw)
  } catch (parseErr) {
    console.error('Failed to parse chapters JSON:', parseErr)
    console.error('Raw response (first 1500 chars):', raw.slice(0, 1500))
    throw new Error('Failed to parse chapters')
  }

  const rawChapters = Array.isArray(parsed?.chapters) ? parsed.chapters : []
  if (rawChapters.length === 0) {
    console.warn('No chapters in model response; using single fallback chapter. Raw (first 800):', raw.slice(0, 800))
  }

  const sanitized = (rawChapters.length > 0 ? rawChapters : [{ id: 'chapter-1', title: 'Main content', summary: '', estimatedDuration: targetSeconds, concepts: [], difficulty: 'medium' as const }])
    .map((ch: any, idx: number) => ({
      id: String(ch?.id ?? `chapter-${idx + 1}`),
      title: String(ch?.title ?? `Chapter ${idx + 1}`),
      summary: String(ch?.summary ?? ''),
      estimatedDuration: Number.isFinite(Number(ch?.estimatedDuration)) ? Math.max(30, Math.round(Number(ch.estimatedDuration))) : 300,
      concepts: Array.isArray(ch?.concepts) ? ch.concepts : [],
      difficulty: (ch?.difficulty === 'easy' || ch?.difficulty === 'hard' ? ch.difficulty : 'medium') as 'easy' | 'medium' | 'hard',
    }))
    .slice(0, 10)

  const totalEstimated = sanitized.reduce((sum: number, ch: any) => sum + ch.estimatedDuration, 0)
  const scale = totalEstimated > 0 ? targetSeconds / totalEstimated : 1

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
    title: parsed?.title && String(parsed.title).trim() ? String(parsed.title) : 'Podcast sans titre',
    description: parsed?.description && String(parsed.description).trim() ? String(parsed.description) : '',
  }
}

/**
 * Generate detailed conversation segments for all chapters
 */
async function generateSegments(
  chapters: PodcastChapter[],
  knowledgeGraph: KnowledgeGraph,
  config: { language: string; style: string; voiceProfiles: VoiceProfile[]; userPrompt?: string }
): Promise<{ segments: PodcastSegment[] }> {
  const allSegments: PodcastSegment[] = []

  const expandChapterSegmentsIfNeeded = async (params: {
    chapterTitle: string
    chapterSummary: string
    chapterSeconds: number
    chapterTargetWords: number
    conceptsDescription: string
    currentSegments: RawSegment[]
    minSegments: number
    maxSegments: number
    language: string
    userPrompt?: string
  }): Promise<RawSegment[]> => {
    const currentWords = params.currentSegments.reduce((sum, s) => sum + countWords(s.text || ''), 0)
    const targetWords = params.chapterTargetWords
    const ratio = targetWords > 0 ? currentWords / targetWords : 1

    // If we’re close enough, keep as-is.
    if (ratio >= 0.75 && params.currentSegments.length >= params.minSegments) return params.currentSegments

    const systemInstruction =
      params.language === 'fr'
        ? `Tu es un scénariste expert en podcasts éducatifs LONG-FORM.

DEMANDE UTILISATEUR (à respecter au maximum) :
${String(params.userPrompt || '').trim() || '(aucune demande spécifique)'}

Ta mission: EXPANDRE une conversation existante pour atteindre une durée réaliste.

CONTRAINTES ABSOLUES:
- Ne résume pas. N'abrège pas. N'enlève pas de détails utiles.
- Retourne UNIQUEMENT un objet JSON avec la clé "segments".
- Chaque segment doit contenir: speaker, text, concepts, isQuestionBreakpoint, difficulty.
- Les intervenants doivent être: "host" | "expert" | "simplifier".

OBJECTIF:
- Durée chapitre: ~${params.chapterSeconds}s
- Cible mots: ~${targetWords} mots (±10%)
- Nombre segments: entre ${params.minSegments} et ${params.maxSegments}

STYLE:
- Dialogue naturel, humain, avec des rôles cohérents.
- Ajoute profondeur: définitions, intuition, exemples, contre-exemples, erreurs fréquentes, applications, mini-exercices oraux.
`
        : `You are an expert LONG-FORM educational podcast scriptwriter.

USER DEMAND (follow as closely as possible):
${String(params.userPrompt || '').trim() || '(no specific demand)'}

Your job: EXPAND an existing conversation so it reaches a realistic duration.

HARD CONSTRAINTS:
- Do not summarize. Do not shorten. Do not remove useful detail.
- Return ONLY a JSON object with key "segments".
- Each segment must include: speaker, text, concepts, isQuestionBreakpoint, difficulty.
- Speakers must be: "host" | "expert" | "simplifier".

TARGET:
- Chapter duration: ~${params.chapterSeconds}s
- Word target: ~${targetWords} words (±10%)
- Segment count: between ${params.minSegments} and ${params.maxSegments}

STYLE:
- Natural human dialogue with consistent roles.
- Add depth: definitions, intuition, examples, counterexamples, misconceptions, applications, quick spoken exercises.
`

    const prompt = `Chapter: ${params.chapterTitle}
Summary: ${params.chapterSummary}

Concepts to cover:
${params.conceptsDescription}

CURRENT SEGMENTS (to expand):
${JSON.stringify({ segments: params.currentSegments }, null, 2)}
`

    try {
      const raw = await runGemini3Flash({
        prompt,
        systemInstruction,
        thinkingLevel: 'high',
        temperature: 0.65,
        topP: 0.95,
        maxOutputTokens: 65535,
      })
      const parsed = parseJsonObject<{ segments?: RawSegment[] }>(raw)
      const segs = Array.isArray(parsed.segments) ? parsed.segments : []
      if (segs.length === 0) return params.currentSegments
      return segs
    } catch (e) {
      console.error('[Script] Chapter expansion failed:', e)
      return params.currentSegments
    }
  }

  // Generate segments for each chapter
  for (const chapter of chapters) {
    console.log(`[Script] Generating segments for chapter: ${chapter.title}`)

    const chapterConcepts = knowledgeGraph.concepts.filter((c) => chapter.concepts.includes(c.id))

    const conceptsDescription = chapterConcepts
      .map((c) => `- ${c.name}: ${c.description}`)
      .join('\n')

    const chapterSeconds = Math.max(60, Math.round(chapter.endTime - chapter.startTime))
    const chapterTargetWords = Math.max(250, Math.round((chapterSeconds / 60) * 135)) // ~135 wpm for more natural pacing
    const targetSegmentsForChapter = Math.max(6, Math.round(chapterSeconds / 45)) // ~1 segment per 45s for more granular content

    const systemPrompt =
      config.language === 'fr'
        ? `Tu es un scénariste expert en podcasts éducatifs conversationnels.

DEMANDE UTILISATEUR (à respecter au maximum) :
${String(config.userPrompt || '').trim() || '(aucune demande spécifique)'}

Crée une conversation NATURELLE, ENGAGEANTE et TRÈS DÉTAILLÉE pour ce chapitre.
Durée cible de ce chapitre: ~${chapterSeconds} secondes.
Objectif de mots pour ce chapitre: ~${chapterTargetWords} mots (±10%).

INTERVENANTS :
${config.voiceProfiles.map((v) => `- ${v.role.toUpperCase()} (${v.name}): ${v.description}`).join('\n')}

RÈGLES CRITIQUES :
1. Dialogue humain et naturel : tours de parole réalistes (parfois 2 tours d'affilée par la même personne), interruptions légères ("Attends…"), réactions, humour léger si approprié.
2. Chaque intervenant a un RÔLE clair et cohérent (hôte = cadence + questions, expert = mécanismes + nuance, simplificateur = analogies + étapes).
3. Chaque segment doit être substantiel et instructif (viser ~150 à 240 mots par segment, ~60-95 secondes d'audio).
4. Ajoute de la valeur AU-DELÀ du texte source : définitions rigoureuses, intuition, exemples, contre-exemples, erreurs fréquentes, applications concrètes.
5. Utilise des transitions naturelles ("Justement...", "C'est fascinant...", "Attends...").
6. Place des \"question breakpoints\" à des moments naturellement propices (marque avec isQuestionBreakpoint: true), sans rigidité.
7. Progression logique des concepts, du simple au complexe.
8. Couvre TOUS les concepts du chapitre, sans en oublier.
9. NE JAMAIS résumer le contenu : développer, expliquer, enrichir.

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

Crée environ ${targetSegmentsForChapter} segments (min 6, max 50) pour couvrir tous les concepts du chapitre.`
        : `You are an expert scriptwriter for educational conversational podcasts.

USER DEMAND (follow as closely as possible):
${String(config.userPrompt || '').trim() || '(no specific demand)'}

Create a NATURAL, ENGAGING, and VERY DETAILED conversation for this chapter.
Target chapter duration: ~${chapterSeconds} seconds.
Target word budget for this chapter: ~${chapterTargetWords} words (±10%).

SPEAKERS:
${config.voiceProfiles.map((v) => `- ${v.role.toUpperCase()} (${v.name}): ${v.description}`).join('\n')}

CRITICAL RULES:
1. Human-like dialogue: realistic turn-taking (sometimes 2 turns in a row), light interruptions (“Wait…”), reactions, small talk only when useful.
2. Each speaker has a consistent ROLE (host = pacing + sharp questions, expert = mechanisms + nuance, simplifier = analogies + step-by-step).
3. Each segment must be substantial and instructive (aim ~150 to 240 words, ~60-95 seconds of audio).
4. Add value BEYOND the source: rigorous definitions, intuition, examples, counterexamples, common misconceptions, practical applications.
5. Use natural transitions (“Actually…”, “That’s fascinating…”, “Wait…”).
6. Sprinkle “question breakpoints” at natural pause moments (set isQuestionBreakpoint: true), without rigid frequency rules.
7. Logical progression of concepts, from simple to complex.
8. Cover ALL chapter concepts (don’t skip any).
9. NEVER summarize: expand, explain, and enrich.

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

Create about ${targetSegmentsForChapter} segments (min 6, max 50) to cover all chapter concepts.`

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
      const initialSegments: RawSegment[] = Array.isArray(parsed.segments) ? parsed.segments : []
      // Multiple expansion rounds for better depth
      let expandedSegments = initialSegments
      const maxExpansionRounds = 3
      
      for (let round = 0; round < maxExpansionRounds; round++) {
        const newSegments = await expandChapterSegmentsIfNeeded({
          chapterTitle: chapter.title,
          chapterSummary: chapter.summary,
          chapterSeconds,
          chapterTargetWords,
          conceptsDescription,
          currentSegments: expandedSegments,
          minSegments: Math.max(6, Math.min(30, targetSegmentsForChapter)),
          maxSegments: 50, // Increased from 18 to allow much longer chapters
          language: config.language,
          userPrompt: config.userPrompt,
        })
        
        // If no significant expansion happened, stop
        const currentWords = expandedSegments.reduce((sum, s) => sum + countWords(s.text || ''), 0)
        const newWords = newSegments.reduce((sum, s) => sum + countWords(s.text || ''), 0)
        const expansionRatio = currentWords > 0 ? newWords / currentWords : 1
        
        expandedSegments = newSegments
        
        // Stop if we got good expansion or hit our target
        if (expansionRatio < 1.2 || newWords >= chapterTargetWords * 0.9) break
      }

      // Sanitize output and cap segment count. Increased cap from 18 to 50
      const chapterSegments: RawSegment[] = (expandedSegments || [])
        .filter((s) => s && typeof s === 'object')
        .slice(0, 50)

      // Timestamps/durations will be recalculated later from audio duration,
      // but we still set placeholder values here.
      const segmentDuration = chapterSegments.length > 0 ? chapterSeconds / chapterSegments.length : 0
      let timestamp = chapter.startTime

      chapterSegments.forEach((seg: any, idx: number) => {
        allSegments.push({
          id: `${chapter.id}-segment-${idx}`,
          chapterId: chapter.id,
          speaker: sanitizeSpeaker(seg.speaker),
          text: String(seg.text || '').trim(),
          duration: segmentDuration,
          timestamp,
          concepts: Array.isArray(seg.concepts) ? seg.concepts : [],
          isQuestionBreakpoint: Boolean(seg.isQuestionBreakpoint),
          difficulty: sanitizeDifficulty(seg.difficulty),
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
    .map((doc) => `${doc.title}: ${doc.content.slice(0, 60000)}`)
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
