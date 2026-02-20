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

function sanitizeSpeaker(speaker: any): 'host' | 'expert' {
  const v = String(speaker || '').toLowerCase().trim()
  if (v === 'expert') return 'expert'
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
  const targetChapters = Math.max(3, Math.round(config.targetDuration / 7.5))

  const documentsSummary = documents
    .map((doc) => `Document: ${doc.title}\nContent:\n${doc.content.slice(0, 200000)}`)
    .join('\n\n---\n\n')

  const conceptsSummary = knowledgeGraph.concepts
    .map((c) => `- ${c.name} (${c.difficulty}): ${c.description}`)
    .join('\n')

  const systemInstruction =
    config.language === 'fr'
      ? `Tu es un expert en creation de contenu podcast educatif.

DEMANDE UTILISATEUR (a respecter au maximum) :
${String(config.userPrompt || '').trim() || '(aucune demande specifique)'}

Cree une structure en CHAPITRES pour un podcast de ${config.targetDuration} minutes avec 2 intervenants : un hote curieux (Alex) et un expert accessible (Jamie).

STYLE : ${config.style}

REGLES :
1. Cree environ ${targetChapters} chapitres (minimum 3, maximum 10)
2. Chaque chapitre doit avoir un titre accrocheur, un resume, une duree estimee (secondes), les concepts couverts, un niveau de difficulte
3. Progression logique du simple au complexe
4. Equilibre entre les chapitres
5. IMPORTANT: La somme des "estimatedDuration" DOIT etre proche de ${targetSeconds} secondes (+/-5%)
6. IMPORTANT: Ce podcast est LONG-FORM. Planifie assez de place pour des discussions profondes, naturelles, avec des exemples, des digressions utiles, et des moments de reflexion.

Retourne un objet json :
{
  "title": "Titre accrocheur du podcast",
  "description": "Description en 2-3 phrases",
  "chapters": [
    {
      "id": "chapter-1",
      "title": "Introduction : Les bases",
      "summary": "Resume du chapitre",
      "estimatedDuration": 300,
      "concepts": ["concept-1", "concept-2"],
      "difficulty": "easy"
    }
  ]
}

Output ONLY the raw JSON object: no markdown, no \`\`\` code block, no text before or after. No trailing commas in arrays or objects.
IMPORTANT : Les IDs des concepts doivent correspondre a ceux fournis dans la liste.`
      : `You are an expert podcast content architect.

USER DEMAND (follow as closely as possible):
${String(config.userPrompt || '').trim() || '(no specific demand)'}

Create a CHAPTER structure for a ${config.targetDuration}-minute podcast featuring 2 speakers: a curious host (Alex) and a knowledgeable expert (Jamie).

STYLE: ${config.style}

RULES:
1. Create about ${targetChapters} chapters (min 3, max 10)
2. Each chapter needs: catchy title, concise summary, estimated duration (seconds), main concepts, difficulty level
3. Logical progression: simple to complex
4. Balance between chapters
5. IMPORTANT: The sum of all "estimatedDuration" MUST be close to ${targetSeconds} seconds (+/-5%)
6. IMPORTANT: This is LONG-FORM content. Plan room for deep, natural discussions with examples, useful tangents, and moments of reflection.

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

Output ONLY the raw JSON object: no markdown, no \`\`\` code block, no text before or after. No trailing commas in arrays or objects.
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
    parsed = { title: '', description: '', chapters: undefined }
  }

  const rawChapters = Array.isArray(parsed.chapters) ? parsed.chapters : []
  if (rawChapters.length === 0) {
    console.warn('Model returned no chapters; using single fallback chapter. Raw (first 1000 chars):', raw.slice(0, 1000))
    parsed.chapters = [
      {
        id: 'chapter-1',
        title: config.language === 'fr' ? 'Contenu principal' : 'Main content',
        summary: '',
        estimatedDuration: targetSeconds,
        concepts: [],
        difficulty: 'medium',
      },
    ]
  }

  const sanitized = (Array.isArray(parsed.chapters) ? parsed.chapters : [])
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
    title: (parsed.title && String(parsed.title).trim()) ? String(parsed.title) : 'Podcast sans titre',
    description: (parsed.description && String(parsed.description).trim()) ? String(parsed.description) : '',
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

    if (ratio >= 0.75 && params.currentSegments.length >= params.minSegments) return params.currentSegments

    const systemInstruction =
      params.language === 'fr'
        ? `Tu es un scénariste expert en podcasts conversationnels naturels.

DEMANDE UTILISATEUR (a respecter au maximum) :
${String(params.userPrompt || '').trim() || '(aucune demande specifique)'}

Ta mission: EXPANDRE une conversation existante pour atteindre une durée réaliste tout en gardant un ton NATUREL et HUMAIN.

INTERVENANTS :
- HOST (Alex) : Hote curieux, pose les questions que l'auditeur se poserait, reagit naturellement, utilise des analogies
- EXPERT (Jamie) : Expert accessible, explique avec passion, utilise un langage informel quand approprié

CONTRAINTES ABSOLUES:
- Ne résume pas. N'abrège pas.
- Retourne UNIQUEMENT un objet JSON avec la clé "segments".
- Chaque segment: speaker ("host" ou "expert"), text, concepts, isQuestionBreakpoint, difficulty.
- Segments COURTS: 1-3 phrases par segment (15-60 mots). Beaucoup de segments courts.
- Ajoute des réactions naturelles: "Ah oui!", "Hmm...", "Attends...", des hésitations, des rires.
- PAS de monologues. Alternance rapide entre les deux intervenants.

OBJECTIF:
- Durée chapitre: ~${params.chapterSeconds}s
- Cible mots: ~${targetWords} mots (+/-10%)
- Nombre segments: entre ${params.minSegments} et ${params.maxSegments}
`
        : `You are a natural-sounding podcast script expander.

USER DEMAND (follow as closely as possible):
${String(params.userPrompt || '').trim() || '(no specific demand)'}

Your job: EXPAND an existing conversation to reach its target duration while keeping it NATURAL and HUMAN-SOUNDING.

SPEAKERS:
- HOST (Alex): Curious host who asks what the listener would ask, reacts naturally, uses analogies
- EXPERT (Jamie): Approachable expert who explains with passion, uses informal language when appropriate

HARD CONSTRAINTS:
- Do not summarize. Do not shorten.
- Return ONLY a JSON object with key "segments".
- Each segment: speaker ("host" or "expert"), text, concepts, isQuestionBreakpoint, difficulty.
- Keep segments SHORT: 1-3 sentences each (15-60 words). Many short segments, not few long ones.
- Add natural reactions: "Oh!", "Hmm...", "Wait...", hesitations, laughter cues [laughs].
- NO monologues. Fast back-and-forth between both speakers.

TARGET:
- Chapter duration: ~${params.chapterSeconds}s
- Word target: ~${targetWords} words (+/-10%)
- Segment count: between ${params.minSegments} and ${params.maxSegments}
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
    const chapterTargetWords = Math.max(250, Math.round((chapterSeconds / 60) * 135))
    // ~1 turn every 8-10 seconds for natural back-and-forth (much more segments than before)
    const targetSegmentsForChapter = Math.max(10, Math.round(chapterSeconds / 9))

    const systemPrompt =
      config.language === 'fr'
        ? `Tu es un scénariste de podcast qui écrit des dialogues INDISTINGUABLES d'une vraie conversation humaine.

DEMANDE UTILISATEUR (a respecter au maximum) :
${String(config.userPrompt || '').trim() || '(aucune demande specifique)'}

Ecris la conversation pour ce chapitre de podcast entre Alex (hote) et Jamie (expert).
Durée cible: ~${chapterSeconds} secondes.
Budget mots: ~${chapterTargetWords} mots (+/-10%).

INTERVENANTS :
- HOST (Alex) : ${config.voiceProfiles.find(v => v.role === 'host')?.description || 'Hote curieux et accessible'}
- EXPERT (Jamie) : ${config.voiceProfiles.find(v => v.role === 'expert')?.description || 'Expert passionné et approchable'}

REGLES POUR UN SON NATUREL ET HUMAIN :
1. SEGMENTS COURTS : 1-3 phrases par segment. Vise 15-60 mots par segment. Jamais plus de 80 mots.
2. DISFLUENCES NATURELLES : Inclus "euh", "hmm", "enfin", "genre", "tu vois" aux moments naturels ou quelqu'un réfléchirait. Pas dans chaque segment, mais régulièrement (~20-30% des segments).
3. REACTIONS : Beaucoup de segments sont juste des réactions : "Ah oui !", "Hmm intéressant...", "Attends, vraiment ?", "C'est dingue", "Ok ok ok". Ces segments font 1-5 mots.
4. INTERRUPTIONS : Parfois un intervenant coupe l'autre : "Attends attends—", "Non mais—", "Pardon, mais—"
5. AUTO-CORRECTIONS : "Enfin, en fait...", "Non attends, je reformule", "Comment dire..."
6. RIRE : Inclus [rires] ou [rire] quand c'est naturel. Un bon podcast a des moments légers.
7. VARIATION DE RYTHME : Certains segments sont excités et rapides, d'autres sont pensifs et lents.
8. PAS DE STRUCTURE RIGIDE : Parfois Alex parle 2-3 fois d'affilée. Parfois Jamie fait une parenthèse. C'est une VRAIE conversation.
9. L'HOTE SIMPLIFIE : Alex reformule ce que Jamie dit en termes simples. "Donc en gros, tu me dis que..."
10. PAS CHAQUE TOUR N'ENSEIGNE : Certains tours sont juste de l'accord, de la surprise, ou du traitement d'info.

CE QU'IL NE FAUT PAS FAIRE :
- Pas de "Bonne question !" ou "C'est une excellente question" - c'est robotique
- Pas de transitions parfaites - la vraie conversation est un peu chaotique
- Pas de résumés à la fin de chaque concept - c'est trop scolaire
- Pas de listes numérotées à l'oral - personne ne parle comme ça

STRUCTURE DES SEGMENTS (json) :
{
  "segments": [
    {
      "speaker": "host",
      "text": "Ok Jamie, donc aujourd'hui on parle de...",
      "concepts": ["concept-1"],
      "isQuestionBreakpoint": false,
      "difficulty": "easy"
    },
    {
      "speaker": "expert",
      "text": "Ouais, et euh... c'est un sujet qui me passionne parce que...",
      "concepts": ["concept-1"],
      "isQuestionBreakpoint": false,
      "difficulty": "easy"
    },
    {
      "speaker": "host",
      "text": "Ah oui ?",
      "concepts": [],
      "isQuestionBreakpoint": false,
      "difficulty": "easy"
    }
  ]
}

Crée environ ${targetSegmentsForChapter} segments (min 10, max 120) pour couvrir tous les concepts du chapitre.
Output ONLY the raw JSON object.`
        : `You are a podcast scriptwriter who produces dialogue INDISTINGUISHABLE from a real human conversation.

USER DEMAND (follow as closely as possible):
${String(config.userPrompt || '').trim() || '(no specific demand)'}

Write the conversation for this podcast chapter between Alex (host) and Jamie (expert).
Target chapter duration: ~${chapterSeconds} seconds.
Target word budget: ~${chapterTargetWords} words (+/-10%).

SPEAKERS:
- HOST (Alex): ${config.voiceProfiles.find(v => v.role === 'host')?.description || 'Curious, relatable host who asks what the listener would ask'}
- EXPERT (Jamie): ${config.voiceProfiles.find(v => v.role === 'expert')?.description || 'Knowledgeable but approachable expert who explains with genuine enthusiasm'}

RULES FOR NATURAL HUMAN-SOUNDING DIALOGUE:
1. SHORT SEGMENTS: 1-3 sentences per segment. Aim for 15-60 words per segment. Never exceed 80 words.
2. NATURAL DISFLUENCIES: Include "um", "uh", "like", "you know", "I mean" at natural thinking points where a human would hesitate. Not in every segment, but regularly (~20-30% of segments).
3. REACTIONS: Many segments should be JUST reactions: "Oh!", "Hmm, interesting...", "Wait, really?", "That's wild", "Right right right". These segments can be 1-5 words.
4. INTERRUPTIONS: Sometimes a speaker cuts in: "Wait wait—", "Hold on—", "Sorry, but—"
5. SELF-CORRECTIONS: "Well, actually...", "No wait, let me rephrase that", "How do I put this..."
6. LAUGHTER: Include [laughs] or [chuckles] where natural. Good podcasts have light moments.
7. PACING VARIATION: Some segments are excited and fast, others are thoughtful and slow.
8. NO RIGID STRUCTURE: Sometimes Alex speaks 2-3 times in a row. Sometimes Jamie goes on a tangent. This is a REAL conversation, not a script.
9. HOST SIMPLIFIES: Alex rephrases what Jamie says in simple terms. "So basically what you're saying is..."
10. NOT EVERY TURN TEACHES: Some turns are just agreement, surprise, or processing. "Huh." "Yeah." "That makes sense."

WHAT NOT TO DO:
- No "Great question!" or "That's an excellent question" — this is robotic and no one talks like this
- No perfect transitions — real conversations are a bit messy
- No summaries at the end of each concept — too textbook-like
- No numbered lists spoken aloud — nobody talks in lists
- No "Let's move on to..." — real conversations flow naturally from one topic to the next

SEGMENT STRUCTURE (json format):
{
  "segments": [
    {
      "speaker": "host",
      "text": "So Jamie, today we're diving into...",
      "concepts": ["concept-1"],
      "isQuestionBreakpoint": false,
      "difficulty": "easy"
    },
    {
      "speaker": "expert",
      "text": "Yeah, and um... this is something I find really fascinating because...",
      "concepts": ["concept-1"],
      "isQuestionBreakpoint": false,
      "difficulty": "easy"
    },
    {
      "speaker": "host",
      "text": "Oh really?",
      "concepts": [],
      "isQuestionBreakpoint": false,
      "difficulty": "easy"
    }
  ]
}

Create about ${targetSegmentsForChapter} segments (min 10, max 120) to cover all chapter concepts.
Output ONLY the raw JSON object.`

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
          minSegments: Math.max(10, Math.min(80, targetSegmentsForChapter)),
          maxSegments: 120,
          language: config.language,
          userPrompt: config.userPrompt,
        })

        const currentWords = expandedSegments.reduce((sum, s) => sum + countWords(s.text || ''), 0)
        const newWords = newSegments.reduce((sum, s) => sum + countWords(s.text || ''), 0)
        const expansionRatio = currentWords > 0 ? newWords / currentWords : 1

        expandedSegments = newSegments

        if (expansionRatio < 1.2 || newWords >= chapterTargetWords * 0.9) break
      }

      const chapterSegments: RawSegment[] = (expandedSegments || [])
        .filter((s) => s && typeof s === 'object')
        .slice(0, 120)

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

Genere 20 questions que les utilisateurs pourraient poser pendant l'ecoute du podcast (anime par Alex et Jamie).

TYPES DE QUESTIONS :
1. Demandes de clarification ("Peux-tu expliquer X plus simplement ?")
2. Approfondissement ("Comment ca marche exactement ?")
3. Exemples concrets ("Donne-moi un exemple")
4. Liens avec autres concepts ("Quel est le lien avec Y ?")
5. Applications pratiques ("Comment utiliser ca ?")

Pour chaque question, fournis une reponse CONCISE (2-3 phrases max).

Retourne un objet json :
{
  "questions": [
    {
      "question": "Question complete de l'utilisateur",
      "answer": "Reponse concise et claire",
      "relevantConcepts": ["concept-1", "concept-2"]
    }
  ]
}

Varie les types de questions et couvre tous les concepts importants.`
      : `You are an expert in anticipating learner questions.

Generate 20 questions that users might ask while listening to the podcast (hosted by Alex and Jamie).

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
