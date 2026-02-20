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

type RawPhase = {
  id?: string
  title?: string
  summary?: string
  concepts?: string[]
  difficulty?: 'easy' | 'medium' | 'hard'
}

type RawSegment = {
  speaker?: string
  text?: string
  phaseId?: string
  concepts?: string[]
  isQuestionBreakpoint?: boolean
  difficulty?: 'easy' | 'medium' | 'hard'
}

type NormalizedPhase = {
  id: string
  title: string
  summary: string
  concepts: string[]
  difficulty: 'easy' | 'medium' | 'hard'
}

type EpisodeDraft = {
  title: string
  description: string
  phases: NormalizedPhase[]
  segments: PodcastSegment[]
}

type ParsedEpisodePayload = {
  title?: string
  description?: string
  phases?: RawPhase[]
  segments?: RawSegment[]
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

function toNonEmptyString(v: any, fallback: string): string {
  const s = String(v ?? '').trim()
  return s.length > 0 ? s : fallback
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)))
}

function sanitizeConceptIds(input: any, allowed: Set<string>): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const raw of input) {
    const id = String(raw ?? '').trim()
    if (!id || !allowed.has(id)) continue
    out.push(id)
  }
  return uniqueStrings(out)
}

function defaultTitleFromDocuments(documents: DocumentContent[], language: string): string {
  const first = documents[0]?.title?.replace(/\.pdf$/i, '').trim()
  if (first) {
    return language === 'fr' ? `Podcast intelligent: ${first}` : `Intelligent podcast: ${first}`
  }
  return language === 'fr' ? 'Podcast intelligent' : 'Intelligent podcast'
}

function makeDurationFromText(text: string): number {
  const words = countWords(text)
  if (words <= 0) return 4
  return Math.max(4, Math.min(95, (words / 135) * 60))
}

function distributeDurations(segments: PodcastSegment[], targetSeconds: number): PodcastSegment[] {
  const baseTotal = segments.reduce((sum, s) => sum + Math.max(1, Number(s.duration) || 0), 0)
  const safeTarget = Math.max(60, targetSeconds)
  const scale = baseTotal > 0 ? safeTarget / baseTotal : 1
  const boundedScale = Math.max(0.55, Math.min(1.9, scale))

  let timestamp = 0
  return segments.map((s) => {
    const scaled = Math.max(3, Math.min(110, Math.round((s.duration * boundedScale) * 10) / 10))
    const out = { ...s, duration: scaled, timestamp }
    timestamp += scaled
    return out
  })
}

function fallbackPhases(language: string, conceptIds: string[]): NormalizedPhase[] {
  const intros = language === 'fr'
    ? ['Ouverture', 'Noyau du sujet', 'Clôture']
    : ['Opening', 'Core discussion', 'Closing reflections']
  return intros.map((title, idx) => ({
    id: `topic-${idx + 1}`,
    title,
    summary: '',
    concepts: idx === 1 ? conceptIds.slice(0, 10) : [],
    difficulty: idx === 0 ? 'easy' : idx === 1 ? 'medium' : 'hard',
  }))
}

function buildPhaseLookup(phases: NormalizedPhase[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const phase of phases) {
    map.set(phase.id.toLowerCase(), phase.id)
    map.set(phase.title.toLowerCase(), phase.id)
  }
  return map
}

function resolvePhaseId(
  rawPhaseId: any,
  index: number,
  total: number,
  phases: NormalizedPhase[],
  lookup: Map<string, string>
): string {
  const key = String(rawPhaseId ?? '').trim().toLowerCase()
  if (key && lookup.has(key)) return lookup.get(key) as string

  if (phases.length === 1) return phases[0].id
  if (total <= 1) return phases[0].id

  const ratio = index / Math.max(1, total - 1)
  if (ratio < 0.12) return phases[0].id
  if (ratio > 0.88) return phases[phases.length - 1].id

  const middle = phases.slice(1, -1)
  if (middle.length === 0) return phases[Math.min(1, phases.length - 1)].id

  const middleRatio = (ratio - 0.12) / 0.76
  const middleIndex = Math.max(0, Math.min(middle.length - 1, Math.floor(middleRatio * middle.length)))
  return middle[middleIndex].id
}

function modeDifficulty(values: Array<'easy' | 'medium' | 'hard'>): 'easy' | 'medium' | 'hard' {
  if (values.length === 0) return 'medium'
  const score: Record<'easy' | 'medium' | 'hard', number> = { easy: 0, medium: 0, hard: 0 }
  values.forEach((v) => { score[v] += 1 })
  if (score.hard >= score.medium && score.hard >= score.easy) return 'hard'
  if (score.easy >= score.medium && score.easy >= score.hard) return 'easy'
  return 'medium'
}

function buildTopicsFromSegments(
  phases: NormalizedPhase[],
  segments: PodcastSegment[],
  language: string
): PodcastChapter[] {
  const byPhase = new Map<string, PodcastSegment[]>()
  for (const seg of segments) {
    if (!byPhase.has(seg.chapterId)) byPhase.set(seg.chapterId, [])
    byPhase.get(seg.chapterId)!.push(seg)
  }

  const chapters: PodcastChapter[] = []
  for (const phase of phases) {
    const phaseSegments = byPhase.get(phase.id) || []
    if (phaseSegments.length === 0) continue

    const start = phaseSegments[0].timestamp
    const end = phaseSegments[phaseSegments.length - 1].timestamp + phaseSegments[phaseSegments.length - 1].duration
    const concepts = uniqueStrings(
      phaseSegments.flatMap((s) => s.concepts).concat(phase.concepts || [])
    )
    const difficulty = modeDifficulty(phaseSegments.map((s) => s.difficulty))

    chapters.push({
      id: phase.id,
      title: phase.title,
      summary: phase.summary || (language === 'fr' ? `Discussion: ${phase.title}` : `Discussion: ${phase.title}`),
      concepts,
      difficulty,
      startTime: start,
      endTime: end,
    })
  }

  if (chapters.length > 0) return chapters

  const totalEnd = segments.length > 0 ? segments[segments.length - 1].timestamp + segments[segments.length - 1].duration : 0
  return [
    {
      id: 'topic-main',
      title: language === 'fr' ? 'Conversation principale' : 'Main conversation',
      summary: '',
      concepts: uniqueStrings(segments.flatMap((s) => s.concepts)),
      difficulty: modeDifficulty(segments.map((s) => s.difficulty)),
      startTime: 0,
      endTime: totalEnd,
    },
  ]
}

function buildFallbackSegments(
  language: string,
  phases: NormalizedPhase[],
  concepts: KnowledgeGraph['concepts']
): PodcastSegment[] {
  const introText = language === 'fr'
    ? `Bienvenue. Aujourd'hui on va clarifier le sujet pas à pas, en gardant l'essentiel et en ajoutant des exemples concrets pour comprendre en profondeur.`
    : `Welcome. Today we will unpack the topic step by step, preserving the core ideas and adding practical examples for deeper understanding.`
  const closingText = language === 'fr'
    ? `On clôt ici: garde les idées clés, relie-les à des situations réelles, et reviens sur les points qui te semblaient encore flous.`
    : `Let's wrap here: keep the core ideas, connect them to real situations, and revisit whichever points still feel unclear.`

  const topConcepts = concepts.slice(0, 12)
  const introPhase = phases[0]?.id || 'topic-1'
  const middlePhase = phases[Math.min(1, phases.length - 1)]?.id || introPhase
  const endPhase = phases[phases.length - 1]?.id || middlePhase

  const raw: Array<Omit<PodcastSegment, 'id' | 'timestamp'>> = [
    {
      chapterId: introPhase,
      speaker: 'host',
      text: introText,
      duration: makeDurationFromText(introText),
      concepts: [],
      isQuestionBreakpoint: false,
      difficulty: 'easy',
    },
  ]

  for (const concept of topConcepts) {
    const expertText = language === 'fr'
      ? `${concept.name}: ${concept.description}. Pour aller plus loin, imagine une situation concrète où ce concept change une décision réelle.`
      : `${concept.name}: ${concept.description}. To deepen this, picture a practical situation where this concept changes a real decision.`
    const hostText = language === 'fr'
      ? `Donc si je reformule, l'idée utile à retenir ici c'est quoi dans la pratique ?`
      : `So if I rephrase it, what is the practical takeaway someone should keep in mind?`

    raw.push({
      chapterId: middlePhase,
      speaker: 'expert',
      text: expertText,
      duration: makeDurationFromText(expertText),
      concepts: [concept.id],
      isQuestionBreakpoint: false,
      difficulty: concept.difficulty || 'medium',
    })
    raw.push({
      chapterId: middlePhase,
      speaker: 'host',
      text: hostText,
      duration: makeDurationFromText(hostText),
      concepts: [concept.id],
      isQuestionBreakpoint: false,
      difficulty: concept.difficulty || 'medium',
    })
  }

  raw.push({
    chapterId: endPhase,
    speaker: 'expert',
    text: closingText,
    duration: makeDurationFromText(closingText),
    concepts: topConcepts.slice(0, 4).map((c) => c.id),
    isQuestionBreakpoint: true,
    difficulty: 'medium',
  })

  let timestamp = 0
  return raw.map((seg, idx) => {
    const out: PodcastSegment = { ...seg, id: `segment-${idx + 1}`, timestamp }
    timestamp += out.duration
    return out
  })
}

function normalizeEpisodePayload(params: {
  parsed: ParsedEpisodePayload
  documents: DocumentContent[]
  knowledgeGraph: KnowledgeGraph
  language: string
  targetDuration: number
}): EpisodeDraft {
  const { parsed, documents, knowledgeGraph, language, targetDuration } = params
  const allowedConceptIds = new Set(knowledgeGraph.concepts.map((c) => c.id))
  const fallbackTitle = defaultTitleFromDocuments(documents, language)
  const allConceptIds = knowledgeGraph.concepts.map((c) => c.id)

  const rawPhases = Array.isArray(parsed.phases) ? parsed.phases : []
  const normalizedPhases: NormalizedPhase[] = []
  const usedIds = new Set<string>()
  rawPhases.forEach((phase, idx) => {
    const baseId = toNonEmptyString(phase?.id, `topic-${idx + 1}`).toLowerCase().replace(/[^a-z0-9\-]+/g, '-')
    const id = usedIds.has(baseId) ? `${baseId}-${idx + 1}` : baseId
    usedIds.add(id)
    normalizedPhases.push({
      id,
      title: toNonEmptyString(phase?.title, language === 'fr' ? `Sujet ${idx + 1}` : `Topic ${idx + 1}`),
      summary: toNonEmptyString(phase?.summary, ''),
      concepts: sanitizeConceptIds(phase?.concepts, allowedConceptIds),
      difficulty: sanitizeDifficulty(phase?.difficulty),
    })
  })

  const phases = normalizedPhases.length > 0 ? normalizedPhases : fallbackPhases(language, allConceptIds)
  const phaseLookup = buildPhaseLookup(phases)

  const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : []
  const builtSegments: PodcastSegment[] = []

  rawSegments.forEach((segment, idx) => {
    if (!segment || typeof segment !== 'object') return
    const text = String(segment.text || '').trim()
    if (text.length < 2) return

    const phaseId = resolvePhaseId(segment.phaseId, idx, rawSegments.length, phases, phaseLookup)
    const concepts = sanitizeConceptIds(segment.concepts, allowedConceptIds)
    const duration = makeDurationFromText(text)

    builtSegments.push({
      id: `segment-${builtSegments.length + 1}`,
      chapterId: phaseId,
      speaker: sanitizeSpeaker(segment.speaker),
      text,
      duration,
      timestamp: 0,
      concepts: concepts.length > 0 ? concepts : (phases.find((p) => p.id === phaseId)?.concepts || []).slice(0, 5),
      isQuestionBreakpoint: Boolean(segment.isQuestionBreakpoint),
      difficulty: sanitizeDifficulty(segment.difficulty),
    })
  })

  const withFallback = builtSegments.length > 0
    ? builtSegments
    : buildFallbackSegments(language, phases, knowledgeGraph.concepts)

  const distributed = distributeDurations(withFallback, Math.max(60, Math.round(targetDuration * 60)))
  const chapters = buildTopicsFromSegments(phases, distributed, language)
  const validChapterIds = new Set(chapters.map((ch) => ch.id))
  const defaultChapterId = chapters[0]?.id || 'topic-main'

  const segments = distributed.map((seg) => ({
    ...seg,
    chapterId: validChapterIds.has(seg.chapterId) ? seg.chapterId : defaultChapterId,
  }))

  return {
    title: toNonEmptyString(parsed.title, fallbackTitle),
    description: toNonEmptyString(parsed.description, ''),
    phases: chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      summary: ch.summary,
      concepts: ch.concepts,
      difficulty: ch.difficulty,
    })),
    segments,
  }
}

function compactDocumentContent(documents: DocumentContent[]): string {
  return documents
    .map((doc) => `Document: ${doc.title}\nContent:\n${doc.content.slice(0, 180000)}`)
    .join('\n\n---\n\n')
}

function compactConcepts(knowledgeGraph: KnowledgeGraph): string {
  return knowledgeGraph.concepts
    .slice(0, 80)
    .map((c) => `- ${c.id}: ${c.name} (${c.difficulty}) -> ${c.description}`)
    .join('\n')
}

async function generateContinuousEpisode(
  documents: DocumentContent[],
  knowledgeGraph: KnowledgeGraph,
  config: { targetDuration: number; language: string; style: string; voiceProfiles: VoiceProfile[]; userPrompt?: string }
): Promise<EpisodeDraft> {
  const hostDescription = config.voiceProfiles.find((v) => v.role === 'host')?.description || 'Curious and relatable host'
  const expertDescription = config.voiceProfiles.find((v) => v.role === 'expert')?.description || 'Insightful and approachable expert'
  const userDemand = String(config.userPrompt || '').trim() || (config.language === 'fr' ? '(aucune demande specifique)' : '(no specific demand)')

  const systemInstruction =
    config.language === 'fr'
      ? `Tu conçois des podcasts éducatifs longs qui ressemblent à une vraie conversation humaine.

Tu transformes des documents de cours en un SEUL épisode cohérent entre Alex et Jamie. Le cœur du travail est de préserver fidèlement les informations importantes, puis d’enrichir l’épisode avec des explications complémentaires utiles, des exemples concrets et des liens avec des situations réelles. Le ton doit rester naturel et vivant: alternance de répliques courtes, relances, et moments plus développés quand Jamie doit approfondir une idée.

Le podcast reste une trajectoire unique: ouverture, développement progressif de plusieurs sujets, puis conclusion. Quand le sujet change, la discussion continue sans redémarrer l’émission.

STYLE SOUHAITÉ: ${config.style}
DEMANDE UTILISATEUR: ${userDemand}
PERSONNAGES: Alex (${hostDescription}) et Jamie (${expertDescription})

Rends uniquement un objet JSON brut avec les clés "title", "description", "phases" et "segments". Les phases sont des sujets de navigation (pas des chapitres d’émission) et les segments utilisent "speaker", "text", "phaseId", "concepts", "isQuestionBreakpoint", "difficulty".`
      : `You design long-form educational podcasts that sound like real human conversation.

You transform study documents into one cohesive episode between Alex and Jamie. The key is to preserve all important source information accurately, then enrich the episode with useful complementary explanations, concrete examples, and real-world links. Keep the voice natural and dynamic, with a mix of quick back-and-forth and longer stretches whenever Jamie needs to fully develop an idea.

The podcast is a single arc with one opening, evolving discussion across topics, and one closing. Topic shifts should feel continuous, not like restarting a new show.

DESIRED STYLE: ${config.style}
USER REQUEST: ${userDemand}
CHARACTERS: Alex (${hostDescription}) and Jamie (${expertDescription})

Return only a raw JSON object containing "title", "description", "phases", and "segments". Phases are navigation topics (not literal show chapters), and segments use "speaker", "text", "phaseId", "concepts", "isQuestionBreakpoint", and "difficulty".`

  const prompt = `Target episode duration: about ${config.targetDuration} minutes.

Source documents:
${compactDocumentContent(documents)}

Available concepts:
${compactConcepts(knowledgeGraph)}`

  const raw = await runGemini3Flash({
    prompt,
    systemInstruction,
    thinkingLevel: 'high',
    temperature: 0.72,
    topP: 0.95,
    maxOutputTokens: 65535,
  })

  let parsed: ParsedEpisodePayload
  try {
    parsed = parseJsonObject<ParsedEpisodePayload>(raw)
  } catch (error) {
    console.error('[Script] Failed to parse continuous episode JSON:', error)
    parsed = {}
  }

  return normalizeEpisodePayload({
    parsed,
    documents,
    knowledgeGraph,
    language: config.language,
    targetDuration: config.targetDuration,
  })
}

async function enrichEpisodeIfNeeded(
  draft: EpisodeDraft,
  documents: DocumentContent[],
  knowledgeGraph: KnowledgeGraph,
  config: { targetDuration: number; language: string; style: string; userPrompt?: string }
): Promise<EpisodeDraft> {
  const words = draft.segments.reduce((sum, s) => sum + countWords(s.text), 0)
  const targetWords = Math.max(700, Math.round(config.targetDuration * 135))
  if (words >= targetWords * 0.78) return draft

  const systemInstruction =
    config.language === 'fr'
      ? `Tu renforces une version existante de podcast sans casser sa continuité.

Conserve ce qui est déjà bon, puis ajoute de la profondeur là où c’est trop court: clarifications, exemples, applications pratiques, limites, comparaisons et liens entre idées. Garde un seul fil narratif avec une seule ouverture et une seule conclusion pour tout l’épisode.

Retourne l’objet JSON COMPLET avec les mêmes clés: "title", "description", "phases", "segments".`
      : `You are improving an existing podcast draft while preserving continuity.

Keep what already works, then deepen sections that are too short by adding clarifications, examples, practical applications, limitations, comparisons, and bridges between ideas. Keep one continuous narrative with one opening and one closing for the whole episode.

Return the FULL JSON object with the same keys: "title", "description", "phases", and "segments".`

  try {
    const raw = await runGemini3Flash({
      prompt: `Target duration: about ${config.targetDuration} minutes.

Source context:
${compactDocumentContent(documents)}

Concept map:
${compactConcepts(knowledgeGraph)}

Current draft:
${JSON.stringify({
  title: draft.title,
  description: draft.description,
  phases: draft.phases.map((p) => ({
    id: p.id,
    title: p.title,
    summary: p.summary,
    concepts: p.concepts,
    difficulty: p.difficulty,
  })),
  segments: draft.segments.map((s) => ({
    speaker: s.speaker,
    text: s.text,
    phaseId: s.chapterId,
    concepts: s.concepts,
    isQuestionBreakpoint: s.isQuestionBreakpoint,
    difficulty: s.difficulty,
  })),
}, null, 2)}`,
      systemInstruction,
      thinkingLevel: 'high',
      temperature: 0.68,
      topP: 0.95,
      maxOutputTokens: 65535,
    })

    const parsed = parseJsonObject<ParsedEpisodePayload>(raw)
    return normalizeEpisodePayload({
      parsed,
      documents,
      knowledgeGraph,
      language: config.language,
      targetDuration: config.targetDuration,
    })
  } catch (error) {
    console.error('[Script] Enrichment failed, using initial draft:', error)
    return draft
  }
}

/**
 * Generate intelligent podcast script with topic navigation, continuous dialogue, and predicted Q&A.
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

  const initialDraft = await generateContinuousEpisode(documents, knowledgeGraph, config)
  const draft = await enrichEpisodeIfNeeded(initialDraft, documents, knowledgeGraph, config)

  const metrics = estimateScriptMetrics(draft.segments)
  console.log(
    `[Script] Segments: ${draft.segments.length}, words: ${metrics.totalWords}, estimated minutes: ${metrics.estimatedMinutes.toFixed(
      1
    )}, avg words/segment: ${metrics.avgWordsPerSegment.toFixed(1)}`
  )

  const predictedQuestions = await generatePredictedQuestions(
    documents,
    knowledgeGraph,
    draft.segments,
    config.language
  )

  console.log('[Script] Script generation completed successfully')

  const chapters = buildTopicsFromSegments(draft.phases, draft.segments, config.language)

  return {
    chapters,
    segments: draft.segments,
    predictedQuestions,
    title: draft.title,
    description: draft.description,
  }
}

/**
 * Generate predicted questions with concise answers.
 */
async function generatePredictedQuestions(
  documents: DocumentContent[],
  knowledgeGraph: KnowledgeGraph,
  segments: PodcastSegment[],
  language: string
): Promise<PredictedQuestion[]> {
  console.log('[Script] Generating predicted Q&A...')

  const contentSummary = documents
    .map((doc) => `${doc.title}: ${doc.content.slice(0, 50000)}`)
    .join('\n\n')

  const conceptsSummary = knowledgeGraph.concepts
    .slice(0, 80)
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n')

  const systemInstruction =
    language === 'fr'
      ? `Tu anticipes les questions qu’un étudiant poserait en interrompant le podcast.

Produis 20 questions réalistes et variées, puis une réponse courte, claire et directement utile pour chacune. Les réponses doivent rester conversationnelles, alignées sur le ton d’Alex et Jamie, et reliées aux concepts importants du cours.

Retourne uniquement un objet JSON avec la clé "questions", où chaque item contient "question", "answer" et "relevantConcepts".`
      : `You anticipate the kinds of questions a learner would ask while interrupting the podcast.

Generate 20 realistic and varied questions, then provide a short, clear, directly useful answer for each one. Keep the answers conversational, aligned with Alex and Jamie's tone, and tied to key concepts from the material.

Return only a JSON object with a "questions" array. Each item should include "question", "answer", and "relevantConcepts".`

  try {
    const raw = await runGemini3Flash({
      prompt: `Podcast transcript excerpt:\n${segments.slice(0, 140).map((s) => `${s.speaker}: ${s.text}`).join('\n')}\n\nSource content:\n${contentSummary}\n\nConcepts:\n${conceptsSummary}`,
      systemInstruction,
      thinkingLevel: 'high',
      temperature: 0.6,
      topP: 0.95,
      maxOutputTokens: 12000,
    })
    const parsed = parseJsonObject<any>(raw)
    const questions = Array.isArray(parsed.questions) ? parsed.questions : []

    return questions.map((q: any, idx: number) => ({
      id: `predicted-q-${idx}`,
      question: String(q?.question || ''),
      answer: String(q?.answer || ''),
      relevantConcepts: sanitizeConceptIds(q?.relevantConcepts, new Set(knowledgeGraph.concepts.map((c) => c.id))),
      relatedSegments: findRelatedSegments(Array.isArray(q?.relevantConcepts) ? q.relevantConcepts : [], segments),
    }))
  } catch (error) {
    console.error('Failed to parse predicted questions:', error)
    return []
  }
}

/**
 * Find segments related to specific concepts.
 */
function findRelatedSegments(conceptIds: string[], segments: PodcastSegment[]): string[] {
  const wanted = new Set(conceptIds.map((id) => String(id || '').trim()).filter(Boolean))
  if (wanted.size === 0) return []
  return segments
    .filter((seg) => seg.concepts.some((c) => wanted.has(c)))
    .map((seg) => seg.id)
}
