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

/**
 * Generate intelligent podcast script as a natural, flowing conversation.
 * The podcast is generated as ONE continuous piece with topics flowing into each other,
 * not as separate chapters with their own introductions and conclusions.
 */
export async function generateIntelligentScript(
  documents: DocumentContent[],
  knowledgeGraph: KnowledgeGraph,
  config: {
    targetDuration: number
    language: string
    style: 'educational' | 'conversational' | 'technical' | 'storytelling'
    voiceProfiles: VoiceProfile[]
    userPrompt?: string
  }
): Promise<ScriptGenerationResult> {
  console.log('[Script] Starting intelligent script generation...')

  // Generate the complete podcast script as one continuous conversation
  const result = await generatePodcastScript(documents, knowledgeGraph, config)

  const totalWords = result.segments.reduce((sum, s) => sum + countWords(s.text), 0)
  const estimatedMinutes = estimateMinutesFromWords(totalWords, 150)
  
  console.log(
    `[Script] Generated: ${result.segments.length} segments, ${totalWords} words, ~${estimatedMinutes.toFixed(1)} min estimated`
  )

  // Generate predicted questions for interactivity
  const predictedQuestions = await generatePredictedQuestions(
    documents,
    knowledgeGraph,
    result.segments,
    config.language
  )

  console.log('[Script] Script generation completed successfully')

  return {
    chapters: result.topics,
    segments: result.segments,
    predictedQuestions,
    title: result.title,
    description: result.description,
  }
}

/**
 * Generate the complete podcast as a natural conversation.
 * This creates a single, cohesive podcast with ONE introduction, 
 * natural topic transitions, and ONE conclusion.
 */
async function generatePodcastScript(
  documents: DocumentContent[],
  knowledgeGraph: KnowledgeGraph,
  config: { targetDuration: number; language: string; style: string; voiceProfiles: VoiceProfile[]; userPrompt?: string }
): Promise<{
  topics: PodcastChapter[]
  segments: PodcastSegment[]
  title: string
  description: string
}> {
  const targetWords = Math.round(config.targetDuration * 150) // ~150 words per minute
  const targetSeconds = config.targetDuration * 60

  const documentsSummary = documents
    .map((doc) => `Document: ${doc.title}\nContent:\n${doc.content.slice(0, 200000)}`)
    .join('\n\n---\n\n')

  const topicsSummary = knowledgeGraph.concepts
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n')

  const hostDescription = config.voiceProfiles.find(v => v.role === 'host')?.description || 'A curious and engaging host'
  const expertDescription = config.voiceProfiles.find(v => v.role === 'expert')?.description || 'A knowledgeable and approachable expert'

  // Select prompt based on language - French gets French prompt, everything else gets English prompt with language instruction
  const systemInstruction = config.language === 'fr'
    ? createFrenchPrompt(config, targetWords, targetSeconds, hostDescription, expertDescription)
    : createEnglishPrompt(config, targetWords, targetSeconds, hostDescription, expertDescription, config.language)

  const prompt = `SOURCE CONTENT:
${documentsSummary}

IDENTIFIED TOPICS:
${topicsSummary}

${config.userPrompt ? `USER'S SPECIFIC REQUEST:\n${config.userPrompt}\n\n` : ''}Generate the complete podcast script now.`

  const raw = await runGemini3Flash({
    prompt,
    systemInstruction,
    thinkingLevel: 'high',
    temperature: 0.8,
    topP: 0.95,
    maxOutputTokens: 65535,
  })

  try {
    const parsed = parseJsonObject<{
      title?: string
      description?: string
      topics?: Array<{
        id?: string
        title?: string
        summary?: string
      }>
      segments?: Array<{
        speaker?: string
        text?: string
        topicId?: string
        isQuestionBreakpoint?: boolean
      }>
    }>(raw)

    // Process topics (these are for navigation/UI, not rigid structure)
    const topics: PodcastChapter[] = (parsed.topics || []).map((t, idx) => ({
      id: t.id || `topic-${idx + 1}`,
      title: t.title || `Topic ${idx + 1}`,
      startTime: 0, // Will be computed after audio generation
      endTime: 0,
      concepts: [],
      difficulty: 'medium' as const,
      summary: t.summary || '',
    }))

    // Process segments
    const segments: PodcastSegment[] = (parsed.segments || []).map((seg, idx) => ({
      id: `segment-${idx}`,
      chapterId: seg.topicId || topics[0]?.id || 'topic-1',
      speaker: (seg.speaker === 'expert' ? 'expert' : 'host') as 'host' | 'expert',
      text: String(seg.text || '').trim(),
      duration: 0,
      timestamp: 0,
      concepts: [],
      isQuestionBreakpoint: Boolean(seg.isQuestionBreakpoint),
      difficulty: 'medium' as const,
    }))

    // Estimate timing
    let timestamp = 0
    for (const seg of segments) {
      const words = countWords(seg.text)
      const duration = (words / 150) * 60 // Convert to seconds
      seg.timestamp = timestamp
      seg.duration = duration
      timestamp += duration
    }

    // Update topic time ranges based on segments
    for (const topic of topics) {
      const topicSegments = segments.filter(s => s.chapterId === topic.id)
      if (topicSegments.length > 0) {
        topic.startTime = Math.min(...topicSegments.map(s => s.timestamp))
        topic.endTime = Math.max(...topicSegments.map(s => s.timestamp + s.duration))
      }
    }

    return {
      topics,
      segments,
      title: parsed.title || 'Podcast',
      description: parsed.description || '',
    }
  } catch (error) {
    console.error('Failed to parse podcast script:', error)
    throw new Error('Failed to generate podcast script')
  }
}

function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    en: 'English',
    fr: 'French',
    es: 'Spanish',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    nl: 'Dutch',
    pl: 'Polish',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
  }
  return names[code] || 'English'
}

function createEnglishPrompt(
  config: { targetDuration: number; style: string; userPrompt?: string },
  targetWords: number,
  targetSeconds: number,
  hostDescription: string,
  expertDescription: string,
  language: string = 'en'
): string {
  const languageName = getLanguageName(language)
  const languageInstruction = language !== 'en' 
    ? `\n\nLANGUAGE REQUIREMENT: The entire podcast MUST be in ${languageName}. All dialogue, the title, and the description must be written in ${languageName}. This is mandatory.\n`
    : ''

  return `You are writing a podcast script. This podcast features two people having a genuine conversation:

Alex (the host): ${hostDescription}
Jamie (the expert): ${expertDescription}
${languageInstruction}
DURATION REQUIREMENT: The podcast MUST be approximately ${config.targetDuration} minutes long. This means you need to generate approximately ${targetWords} words of dialogue (at ~150 words per minute speaking rate). This is a strict requirement - do not generate significantly less content. If you're covering the material too quickly, add more examples, more back-and-forth discussion, more exploration of the ideas.

THE PODCAST YOU'RE CREATING

Think of your favorite educational podcasts - the ones where you forget you're learning because the conversation is so engaging. That's what you're creating. Two people genuinely excited about a topic, bouncing ideas off each other, sometimes going on tangents, sometimes disagreeing, always making it interesting.

WHAT MAKES A GREAT PODCAST

The best podcasts feel like eavesdropping on a fascinating conversation between friends. The host is genuinely curious, not just reading questions off a list. The expert shares knowledge like they're explaining something cool to a friend, not lecturing. There are moments of surprise, moments of humor, moments where one person builds on what the other said in unexpected ways.

When the expert explains something complex, they take the time to develop their thoughts fully. Sometimes this means speaking for several sentences in a row - that's natural. A real expert doesn't just give one-line answers. They explain, give examples, make connections, share stories. Let them breathe.

The host doesn't just ask questions. They react genuinely. They make connections. They push back sometimes. They share their own perspective. They summarize in their own words to make sure they understand.

HOW IT FLOWS

This is ONE podcast, not a series of mini-podcasts glued together. There's one opening that draws listeners in, one closing that wraps things up. In between, topics flow naturally from one to another - sometimes with explicit transitions, sometimes the conversation just drifts there organically.

Don't announce "Now we're moving to topic X." Real conversations don't work that way. Instead, let one idea lead to another: "Speaking of that..." or "That actually reminds me of something else..." or sometimes just following the natural thread of the discussion.

The style is: ${config.style}

WHAT TO COVER

Based on the source material, cover all the important information. But don't just recite facts. Transform the content into a conversation where:
- Complex ideas get broken down through dialogue
- Examples and analogies make abstract concepts concrete
- Real-world applications show why this matters
- The expert can go deeper on fascinating details
- The host can ask what listeners would want to ask

Add value beyond the source material when it helps: relevant examples, interesting connections, practical applications, thought-provoking questions. Make the content richer, not just repeated.

OUTPUT FORMAT

Return a JSON object with this structure:
{
  "title": "An engaging podcast title",
  "description": "A 2-3 sentence description that makes people want to listen",
  "topics": [
    {
      "id": "topic-1",
      "title": "Topic title for navigation",
      "summary": "Brief summary"
    }
  ],
  "segments": [
    {
      "speaker": "host",
      "text": "What they say",
      "topicId": "topic-1",
      "isQuestionBreakpoint": false
    }
  ]
}

Each segment is one person's turn speaking. A turn can be a single reaction ("Huh, interesting!") or a longer explanation with multiple sentences. Let the conversation breathe - some turns are short reactions, some are longer explorations of an idea.

Mark isQuestionBreakpoint as true on segments where a listener might naturally want to pause and ask their own question.

REMEMBER: Generate approximately ${targetWords} words total to fill ${config.targetDuration} minutes.${language !== 'en' ? ` Write everything in ${languageName}.` : ''}

Now create the podcast script.`
}

function createFrenchPrompt(
  config: { targetDuration: number; style: string; userPrompt?: string },
  targetWords: number,
  targetSeconds: number,
  hostDescription: string,
  expertDescription: string
): string {
  return `Tu écris un script de podcast EN FRANÇAIS. Ce podcast met en scène deux personnes ayant une vraie conversation :

Alex (l'animateur) : ${hostDescription}
Jamie (l'expert) : ${expertDescription}

EXIGENCE DE LANGUE : Tout le podcast DOIT être en français. Tous les dialogues, le titre et la description doivent être rédigés en français. C'est obligatoire.

EXIGENCE DE DURÉE : Le podcast DOIT durer environ ${config.targetDuration} minutes. Cela signifie que tu dois générer environ ${targetWords} mots de dialogue (à environ 150 mots par minute de parole). C'est une exigence stricte - ne génère pas significativement moins de contenu. Si tu couvres la matière trop rapidement, ajoute plus d'exemples, plus de discussions, plus d'exploration des idées.

LE PODCAST QUE TU CRÉES

Pense à tes podcasts éducatifs préférés - ceux où tu oublies que tu apprends parce que la conversation est si captivante. C'est ça que tu crées. Deux personnes véritablement passionnées par un sujet, échangeant des idées, parfois partant sur des tangentes, parfois en désaccord, toujours intéressant.

CE QUI FAIT UN EXCELLENT PODCAST

Les meilleurs podcasts donnent l'impression d'écouter discrètement une conversation fascinante entre amis. L'animateur est véritablement curieux, pas juste en train de lire des questions. L'expert partage ses connaissances comme s'il expliquait quelque chose de passionnant à un ami, pas en donnant un cours magistral. Il y a des moments de surprise, d'humour, des moments où l'un rebondit sur ce que l'autre a dit de manière inattendue.

Quand l'expert explique quelque chose de complexe, il prend le temps de développer pleinement ses idées. Parfois ça veut dire parler pendant plusieurs phrases d'affilée - c'est naturel. Un vrai expert ne donne pas que des réponses d'une ligne. Il explique, donne des exemples, fait des connexions, partage des histoires. Laisse-le respirer.

L'animateur ne fait pas que poser des questions. Il réagit sincèrement. Il fait des connexions. Il conteste parfois. Il partage son propre point de vue. Il reformule avec ses propres mots pour s'assurer qu'il a compris.

COMMENT ÇA S'ENCHAÎNE

C'est UN podcast, pas une série de mini-podcasts collés ensemble. Il y a une seule ouverture qui accroche les auditeurs, une seule conclusion qui conclut le tout. Entre les deux, les sujets s'enchaînent naturellement - parfois avec des transitions explicites, parfois la conversation dérive juste organiquement.

N'annonce pas "Maintenant on passe au sujet X." Les vraies conversations ne fonctionnent pas comme ça. Au lieu de ça, laisse une idée mener à une autre : "En parlant de ça..." ou "Ça me fait penser à autre chose..." ou parfois juste en suivant le fil naturel de la discussion.

Le style est : ${config.style}

CE QU'IL FAUT COUVRIR

En te basant sur le contenu source, couvre toutes les informations importantes. Mais ne récite pas juste des faits. Transforme le contenu en une conversation où :
- Les idées complexes sont décomposées à travers le dialogue
- Les exemples et analogies rendent les concepts abstraits concrets
- Les applications concrètes montrent pourquoi c'est important
- L'expert peut approfondir les détails fascinants
- L'animateur peut poser ce que les auditeurs voudraient demander

Ajoute de la valeur au-delà du contenu source quand ça aide : exemples pertinents, connexions intéressantes, applications pratiques, questions qui font réfléchir. Rends le contenu plus riche, pas juste répété.

FORMAT DE SORTIE

Retourne un objet JSON avec cette structure :
{
  "title": "Un titre de podcast accrocheur",
  "description": "Une description de 2-3 phrases qui donne envie d'écouter",
  "topics": [
    {
      "id": "topic-1",
      "title": "Titre du sujet pour la navigation",
      "summary": "Bref résumé"
    }
  ],
  "segments": [
    {
      "speaker": "host",
      "text": "Ce qu'il dit",
      "topicId": "topic-1",
      "isQuestionBreakpoint": false
    }
  ]
}

Chaque segment est le tour de parole d'une personne. Un tour peut être une simple réaction ("Ah, intéressant !") ou une explication plus longue avec plusieurs phrases. Laisse la conversation respirer - certains tours sont des réactions courtes, d'autres sont des explorations plus longues d'une idée.

Marque isQuestionBreakpoint comme true sur les segments où un auditeur pourrait naturellement vouloir faire pause et poser sa propre question.

RAPPEL : Génère environ ${targetWords} mots au total pour remplir ${config.targetDuration} minutes. Écris tout en français.

Maintenant crée le script du podcast.`
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

  const topicsSummary = knowledgeGraph.concepts
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n')

  const systemInstruction =
    language === 'fr'
      ? `Tu anticipes les questions que les auditeurs pourraient avoir pendant l'écoute du podcast.

Génère 15-20 questions naturelles qu'un auditeur curieux pourrait vouloir poser, avec des réponses concises mais utiles.

Varie les types : clarifications, approfondissements, exemples concrets, liens avec d'autres sujets, applications pratiques.

Retourne un JSON :
{
  "questions": [
    {
      "question": "La question de l'auditeur",
      "answer": "Réponse concise (2-4 phrases)",
      "relevantConcepts": ["topic-1"]
    }
  ]
}`
      : `You anticipate questions listeners might have while listening to the podcast.

Generate 15-20 natural questions that a curious listener might want to ask, with concise but helpful answers.

Vary the types: clarifications, deeper dives, concrete examples, connections to other topics, practical applications.

Return a JSON:
{
  "questions": [
    {
      "question": "The listener's question",
      "answer": "Concise answer (2-4 sentences)",
      "relevantConcepts": ["topic-1"]
    }
  ]
}`

  try {
    const raw = await runGemini3Flash({
      prompt: `Content:\n${contentSummary}\n\nTopics:\n${topicsSummary}`,
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
