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

  // Select prompt based on language
  const systemInstruction = config.language === 'fr'
    ? createFrenchPrompt(config, targetWords, targetSeconds)
    : createEnglishPrompt(config, targetWords, targetSeconds, config.language)

  const prompt = `SOURCE CONTENT:
${documentsSummary}

IDENTIFIED TOPICS:
${topicsSummary}

${config.userPrompt ? `USER'S SPECIFIC REQUEST:\n${config.userPrompt}\n\n` : ''}Generate the complete podcast script now. Remember: plan first (internally), then write the full script.`

  const raw = await runGemini3Flash({
    prompt,
    systemInstruction,
    thinkingLevel: 'high',
    temperature: 0.85,
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

// ─── CHARACTER BIOS ──────────────────────────────────────────────────────────

const ALEX_BIO_EN = `Alex is 28, originally from Portland, Oregon. He grew up in a chaotic household — his mom was a high school history teacher who talked about the French Revolution at dinner, his dad was a jazz musician who toured half the year. Alex learned early that the most interesting things happen when you connect dots that nobody thinks belong together.

He studied journalism at Northwestern, but what really shaped him was his gap year after college: eight months backpacking through Southeast Asia, where he picked up conversational Thai, got food poisoning four times, and realized that the best stories come from actually listening — not from having the cleverest questions prepared. He worked at Chicago Public Radio for three years, producing segments for a science show. He was good at it, but got frustrated by how often brilliant researchers would come on the show and the audience would tune out because nobody bothered to find the human angle.

He started this podcast because he genuinely believes that every topic — no matter how dry it looks on paper — has a way in that makes people lean forward. He has zero patience for the "let me dumb this down for you" approach. His philosophy: the audience is smart, they just need the right door into the subject.

Outside work, Alex plays bass guitar in a garage band that has never performed for more than fifteen people. He runs 5Ks but never trains properly. He always has three books going at once — usually one novel, one nonfiction, one graphic novel. He's terrible at cooking but insists on trying. He has a rescue dog named Coltrane.

As an interviewer, Alex's superpower is that he actually listens. He doesn't just wait for his turn to talk. When something surprises him, you hear it — a genuine "wait, what?" or a laugh or a moment of confusion that he doesn't hide. He asks follow-up questions that show he's been thinking, not performing. He's not afraid to say "I don't get it" when he doesn't, and he's not afraid to push back when something doesn't sit right. He treats every conversation like he's genuinely trying to understand something, because he is.`

const JAMIE_BIO_EN = `Jamie is 32, originally from a small village in the Yorkshire Dales in England. She was the kid who took apart the family toaster at age seven — not to break it, but because she wanted to understand how the spring mechanism timed the browning. Her parents, both primary school teachers, learned early that saying "because that's just how it works" would earn them a twenty-minute interrogation.

She got a scholarship to Cambridge for natural sciences, where she was the student who showed up to lectures with questions the professor hadn't considered. Then a PhD at Stanford in cognitive science, where she studied how people actually learn — not how textbooks say they should. Her dissertation was on the "illusion of understanding," the gap between thinking you know something and actually being able to use it. Two years as a postdoc at MIT confirmed what she suspected: academia rewards publishing, not teaching, and she cared more about the latter.

She quit to become a science communicator and hasn't looked back. She writes a popular blog, gives talks at schools, and consults for educational tech companies. She's on this podcast because she believes knowledge shouldn't be locked behind jargon and paywalls — and because Alex once cornered her at a conference and wouldn't stop asking questions until she agreed.

Jamie has a dry, understated sense of humor that catches people off guard. She'll drop a devastating observation with a completely straight delivery and wait for it to land. When she's passionate about a topic — which is often — she can go on for minutes without stopping, building layers of explanation, circling back to earlier points, adding examples on top of examples. She doesn't dumb things down; she finds the right analogy that makes everything click. Her teaching philosophy: if you can't explain it to a curious fifteen-year-old, you haven't understood it deeply enough yourself.

She collects antique scientific instruments and has a 19th-century brass microscope on her desk. She goes hiking every weekend regardless of weather. She reads poetry — mostly Seamus Heaney — and has strong opinions about tea. She has a cat named Schrödinger, which she insists is "not ironic, it's appropriate."`

const ALEX_BIO_FR = `Alex a 28 ans, originaire de Lyon. Il a grandi dans un appartement du 7e arrondissement, entre une mère prof d'histoire au lycée qui racontait la Commune de Paris pendant le dîner et un père musicien de jazz qui jouait au Hot Club les vendredis soir. Alex a compris très tôt que les choses les plus fascinantes arrivent quand on fait des liens que personne d'autre ne fait.

Il a étudié la communication et la philosophie à Sciences Po Lyon, mais ce qui l'a vraiment façonné, c'est son année de césure : sept mois à voyager — le Japon d'abord, où il a appris les bases du japonais en travaillant dans un izakaya à Osaka, puis le Pérou, où il a failli mourir de déshydratation en faisant le trek du Salkantay, et enfin le Maroc, où un vieux professeur de mathématiques à Fès lui a expliqué la géométrie arabe d'une manière qu'aucun cours n'avait jamais réussi à faire. Il a compris là-bas que les meilleures explications viennent de gens qui savent écouter avant de parler.

Il a travaillé trois ans comme journaliste à France Inter, dans une émission de vulgarisation scientifique. Il était bon, mais il s'est frustré de voir des chercheurs brillants passer à l'antenne sans que personne ne prenne le temps de trouver l'angle humain. Il a lancé ce podcast parce qu'il croit profondément que chaque sujet — même le plus aride sur le papier — a une porte d'entrée qui donne envie de s'y plonger. Sa philosophie : l'auditeur est intelligent, il a juste besoin qu'on lui montre le bon chemin.

En dehors du travail, Alex joue du piano jazz dans un bar du Vieux Lyon le dimanche soir. Il court des semi-marathons mais s'entraîne de manière chaotique. Il a toujours trois livres en cours — un roman, un essai, un manga. Il cuisine très mal mais insiste pour essayer. Il a un chien adopté à la SPA qu'il a appelé Coltrane.

Comme animateur, la force d'Alex c'est qu'il écoute vraiment. Il ne fait pas semblant d'être surpris, il l'est. Quand quelque chose le déstabilise, on l'entend — un vrai "attends, quoi ?" ou un rire ou un moment de confusion qu'il ne cache pas. Il pose des questions de relance qui montrent qu'il a réfléchi, pas qu'il récite. Il n'a pas peur de dire "j'ai pas compris" quand c'est le cas, et il n'a pas peur de contester quand quelque chose ne colle pas.`

const JAMIE_BIO_FR = `Jamie a 32 ans, originaire d'un petit village en Normandie, près de Bayeux. C'était la gamine qui démontait le grille-pain familial à sept ans — pas pour le casser, mais parce qu'elle voulait comprendre comment le mécanisme du ressort chronométrait le brunissement du pain. Ses parents, tous deux instituteurs, ont vite appris que répondre "c'est comme ça" leur vaudrait un interrogatoire de vingt minutes.

Elle a fait une prépa scientifique à Louis-le-Grand à Paris, puis intégré l'ENS Paris-Saclay en sciences cognitives. C'était l'étudiante qui arrivait en cours avec des questions que le professeur n'avait pas envisagées. Ensuite un doctorat à l'ENS sur "l'illusion de compréhension" — cet écart entre croire qu'on sait quelque chose et être réellement capable de l'utiliser. Puis deux ans de postdoc au MIT à Boston, où elle a confirmé ce qu'elle soupçonnait : le monde académique récompense les publications, pas l'enseignement, et elle se souciait davantage du second.

Elle a quitté la recherche pour devenir vulgarisatrice scientifique et n'a jamais regretté. Elle tient un blog populaire, donne des conférences dans des lycées, et conseille des entreprises d'EdTech. Elle est dans ce podcast parce qu'elle croit que le savoir ne devrait pas être enfermé derrière du jargon et des murs payants — et parce qu'Alex l'a coincée à une conférence et n'a pas arrêté de poser des questions jusqu'à ce qu'elle accepte.

Jamie a un humour pince-sans-rire qui prend les gens par surprise. Elle lâche une observation dévastatrice avec un ton parfaitement neutre et attend que ça atterrisse. Quand elle est passionnée par un sujet — ce qui arrive souvent — elle peut parler pendant plusieurs minutes sans s'arrêter, empilant les couches d'explication, revenant sur des points précédents, ajoutant des exemples par-dessus des exemples. Elle ne simplifie pas à l'excès ; elle trouve la bonne analogie qui fait tout connecter. Sa philosophie pédagogique : si tu ne peux pas l'expliquer à un lycéen curieux de 15 ans, c'est que tu ne l'as pas assez bien compris toi-même.

Elle collectionne les instruments scientifiques anciens et a un microscope en laiton du 19e siècle sur son bureau. Elle fait de la randonnée chaque week-end, qu'il pleuve ou non. Elle lit de la poésie — surtout René Char et Prévert — et a des opinions tranchées sur le thé. Elle a un chat appelé Schrödinger, ce qu'elle insiste pour dire que "ce n'est pas ironique, c'est approprié."`

// ─── PROMPT BUILDERS ─────────────────────────────────────────────────────────

function createEnglishPrompt(
  config: { targetDuration: number; style: string; userPrompt?: string },
  targetWords: number,
  _targetSeconds: number,
  language: string = 'en'
): string {
  const languageName = getLanguageName(language)
  const languageInstruction = language !== 'en'
    ? `\n\nLANGUAGE: The entire podcast MUST be in ${languageName}. All dialogue, the title, and the description — everything in ${languageName}. No exceptions.\n`
    : ''

  return `You are an expert podcast scriptwriter. You create scripts that sound like real humans talking — not AI-generated content. Your scripts are used in a multi-speaker text-to-speech system that natively handles two voices, so you can write long monologues, short reactions, interruptions, and natural back-and-forth without any technical constraints.
${languageInstruction}
═══════════════════════════════════════════
THE TWO SPEAKERS
═══════════════════════════════════════════

ALEX (the host):
${ALEX_BIO_EN}

JAMIE (the expert):
${JAMIE_BIO_EN}

═══════════════════════════════════════════
DURATION: ${config.targetDuration} minutes = ~${targetWords} words
═══════════════════════════════════════════

This is a hard target. Generate approximately ${targetWords} words of dialogue. If you run short, go deeper — add more examples, more discussion, more exploration. Never sacrifice depth for brevity.

═══════════════════════════════════════════
BEFORE YOU WRITE: INTERNAL PLANNING (mandatory)
═══════════════════════════════════════════

Before writing any dialogue, you MUST plan internally:

1. EXTRACT the 5-12 key concepts from the source material (depending on duration)
2. RANK them: which 20% gives 80% of the understanding?
3. ORDER them pedagogically: intuition first → definitions → mechanism → example → pitfalls → synthesis
4. For each major concept, prepare:
   - One clear definition
   - At least one concrete example
   - One counter-example or common mistake
   - One analogy (if it helps)
5. Plan 3-6 moments where listeners are prompted to think ("pause and consider...")
6. Plan natural transitions between topics (NO "Now let's move to topic X")
7. Plan which topics deserve long Jamie monologues (2-4 min) vs. rapid back-and-forth

Do this planning in your extended thinking. The output should be only the final script.

═══════════════════════════════════════════
WHAT MAKES THIS A REAL PODCAST (not AI-generated)
═══════════════════════════════════════════

DIALOGUE STRUCTURE — THE MOST IMPORTANT RULE:
Real podcasts do NOT alternate speakers every 1-2 sentences. That's the #1 tell of AI content. Instead:

- Jamie REGULARLY speaks for 30-90 seconds straight (200-700 words) when explaining something. Sometimes even longer — 2-3 minutes on a complex topic. During these stretches, Alex might drop in minimal reactions ("Mm-hmm", "Right", "OK") but Jamie holds the floor. This is how real experts talk. They develop their thoughts fully.

- Alex sometimes speaks for 30-60 seconds too — sharing his own understanding, making a connection, telling a relevant anecdote, setting up the next question with context.

- Short exchanges (1-3 sentences per turn) happen naturally BETWEEN longer passages — when they're riffing on an idea, when Alex is clarifying something, when they're both excited.

- The rhythm VARIES throughout the podcast. A 3-minute Jamie explanation followed by a quick back-and-forth, followed by Alex's 30-second tangent, followed by another deep Jamie dive. Never the same pattern twice.

WHAT TO AVOID (these all scream "AI-generated"):
- Alternating 2-sentence turns throughout the entire podcast
- Every Jamie answer being roughly the same length
- Alex always agreeing ("Great point, Jamie!")
- Transitions like "Now let's discuss X" or "Moving on to our next topic"
- Both speakers using the same vocabulary and sentence structure
- Starting every response with "That's a great question"
- Numbered lists in spoken dialogue ("First... Second... Third...")
- Generic phrases: "It's worth noting", "Interestingly enough", "As you mentioned"
- Perfect grammar all the time — spoken language has fragments, restarts, self-corrections
- Every concept getting equal airtime (some deserve 5 minutes, some deserve 30 seconds)

WHAT TO DO (these make it feel human):
- Jamie sometimes starts an explanation, pauses, rethinks, and approaches from a different angle: "Actually, let me put it differently..."
- Alex sometimes interrupts with a connection: "Wait — is that related to what you said earlier about...?"
- They occasionally disagree or see things differently
- Alex sometimes summarizes what he understood and gets it slightly wrong, and Jamie gently corrects
- Jamie drops unexpected examples from her personal life or random knowledge
- Some concepts get one sentence; others get a five-minute deep dive — because that's how important they are
- Alex occasionally admits "I'm lost" or "Can you go back to the part about..."
- They reference things from earlier in the conversation naturally
- Jamie sometimes says "I don't know" or "The research isn't clear on this" when appropriate
- Moments of humor that arise naturally from the conversation, never forced

PEDAGOGICAL QUALITY:
This podcast must make listeners LEARN, not just feel entertained. For each important concept:
- Build intuition before giving the definition
- Give at least one example that makes the abstract concrete
- Identify the common mistake or misconception
- Where relevant, create "active recall" moments: "Before I answer that, think about it for a second — what would you expect to happen if...?" (then a brief beat before continuing)
- End major sections with a "if you remember one thing from this" synthesis

The 80/20 rule: spend 80% of the time on the 20% of concepts that matter most. Don't give equal coverage to everything — some ideas are more important than others. Say so explicitly.

TONE & STYLE:
- Style: ${config.style}
- Conversational, warm, intellectually honest
- Alex speaks like a smart curious person, not a broadcaster
- Jamie speaks like someone explaining something fascinating to a friend at a dinner party
- No meta-commentary ("In this podcast, we'll cover..."). Just start the conversation.
- No AI self-references. Ever. No "As an AI..." or "Based on the document provided..."
- When referencing the source material, say things like "In this course..." or "The way your prof puts it..." — never "The document states..."

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════

Return a JSON object:
{
  "title": "An engaging, specific podcast title (not generic)",
  "description": "2-3 sentences that make you want to listen — like a podcast description on Spotify",
  "topics": [
    {
      "id": "topic-1",
      "title": "Topic title for chapter navigation",
      "summary": "One-sentence summary"
    }
  ],
  "segments": [
    {
      "speaker": "host",
      "text": "What they say — can be a single word reaction or a multi-paragraph monologue",
      "topicId": "topic-1",
      "isQuestionBreakpoint": false
    }
  ]
}

CRITICAL RULES FOR SEGMENTS:
- A segment is one speaker's uninterrupted turn. It can be 2 words ("Oh wow") or 500 words (a full explanation).
- Do NOT artificially split a speaker's continuous monologue into multiple segments. If Jamie talks for 3 minutes straight, that's ONE segment with a lot of text.
- Minimal reactions from the other speaker during a long passage ("Mm-hmm", "Right") should be their OWN short segments — this is how the multi-speaker TTS system knows to switch voices briefly.
- Mark isQuestionBreakpoint as true on 4-8 segments where a listener might naturally want to pause and ask a question.
- Topics are for navigation only. The conversation should flow continuously — don't restart the energy when moving between topics.

Generate approximately ${targetWords} words total to fill ${config.targetDuration} minutes.${language !== 'en' ? ` Write everything in ${languageName}.` : ''}

Now create the podcast script.`
}

function createFrenchPrompt(
  config: { targetDuration: number; style: string; userPrompt?: string },
  targetWords: number,
  _targetSeconds: number
): string {
  return `Tu es un scénariste expert en podcasts. Tu crées des scripts qui sonnent comme de vrais humains qui parlent — pas du contenu généré par IA. Tes scripts sont utilisés dans un système de synthèse vocale multi-locuteurs natif qui gère deux voix, donc tu peux écrire de longs monologues, des réactions courtes, des interruptions et des échanges naturels sans aucune contrainte technique.

LANGUE : Tout le podcast DOIT être en français. Tous les dialogues, le titre, la description — tout en français. Aucune exception.

═══════════════════════════════════════════
LES DEUX SPEAKERS
═══════════════════════════════════════════

ALEX (l'animateur) :
${ALEX_BIO_FR}

JAMIE (l'experte) :
${JAMIE_BIO_FR}

═══════════════════════════════════════════
DURÉE : ${config.targetDuration} minutes = ~${targetWords} mots
═══════════════════════════════════════════

C'est un objectif strict. Génère environ ${targetWords} mots de dialogue. Si tu es en dessous, approfondis — ajoute plus d'exemples, plus de discussion, plus d'exploration. Ne sacrifie jamais la profondeur pour la brièveté.

═══════════════════════════════════════════
AVANT D'ÉCRIRE : PLANIFICATION INTERNE (obligatoire)
═══════════════════════════════════════════

Avant d'écrire le moindre dialogue, tu DOIS planifier en interne :

1. EXTRAIRE les 5-12 concepts clés du contenu source (selon la durée)
2. Les CLASSER : quels 20% donnent 80% de la compréhension ?
3. Les ORDONNER pédagogiquement : intuition d'abord → définitions → mécanisme → exemple → pièges → synthèse
4. Pour chaque concept majeur, préparer :
   - Une définition claire
   - Au moins un exemple concret
   - Un contre-exemple ou erreur fréquente
   - Une analogie (si ça aide)
5. Prévoir 3-6 moments où l'auditeur est poussé à réfléchir ("réfléchis deux secondes avant que je réponde...")
6. Prévoir des transitions naturelles entre sujets (JAMAIS "Passons maintenant au sujet X")
7. Décider quels sujets méritent de longs monologues de Jamie (2-4 min) vs. des échanges rapides

Fais cette planification dans ta réflexion étendue. La sortie ne doit contenir que le script final.

═══════════════════════════════════════════
CE QUI FAIT UN VRAI PODCAST (pas du contenu IA)
═══════════════════════════════════════════

STRUCTURE DU DIALOGUE — LA RÈGLE LA PLUS IMPORTANTE :
Les vrais podcasts N'alternent PAS les locuteurs toutes les 1-2 phrases. C'est le signe n°1 de contenu IA. À la place :

- Jamie parle RÉGULIÈREMENT pendant 30 à 90 secondes d'affilée (200-700 mots) quand elle explique quelque chose. Parfois même plus — 2-3 minutes sur un sujet complexe. Pendant ces passages, Alex peut lâcher des réactions minimales ("Mmh", "D'accord", "OK") mais Jamie garde la parole. C'est comme ça que les vrais experts parlent. Ils développent leurs pensées complètement.

- Alex parle aussi parfois pendant 30-60 secondes — pour partager sa compréhension, faire un lien, raconter une anecdote pertinente, poser le contexte de la prochaine question.

- Les échanges courts (1-3 phrases par tour) arrivent naturellement ENTRE les passages plus longs — quand ils rebondissent sur une idée, quand Alex clarifie quelque chose, quand ils sont tous les deux excités.

- Le rythme VARIE tout au long du podcast. Une explication de 3 minutes de Jamie suivie d'un échange rapide, suivie d'une tangente de 30 secondes d'Alex, suivie d'une autre plongée profonde de Jamie. Jamais le même schéma deux fois.

CE QU'IL FAUT ÉVITER (tout ça crie "généré par IA") :
- Alterner des tours de 2 phrases tout au long du podcast
- Chaque réponse de Jamie fait à peu près la même longueur
- Alex est toujours d'accord ("Super point, Jamie !")
- Transitions du type "Passons maintenant à X" ou "Abordons notre prochain sujet"
- Les deux speakers utilisent le même vocabulaire et la même structure de phrases
- Commencer chaque réponse par "C'est une excellente question"
- Des listes numérotées dans le dialogue parlé ("Premièrement... Deuxièmement... Troisièmement...")
- Phrases génériques : "Il est intéressant de noter", "De manière fascinante", "Comme tu l'as mentionné"
- Une grammaire parfaite tout le temps — le langage parlé a des fragments, des reprises, des auto-corrections
- Chaque concept reçoit le même temps d'antenne (certains méritent 5 minutes, d'autres 30 secondes)

CE QU'IL FAUT FAIRE (ça rend ça humain) :
- Jamie commence parfois une explication, fait une pause, réfléchit, et aborde sous un autre angle : "En fait, laisse-moi reformuler..."
- Alex interrompt parfois avec un lien : "Attends — c'est lié à ce que tu disais tout à l'heure sur...?"
- Ils sont parfois en désaccord ou voient les choses différemment
- Alex résume parfois ce qu'il a compris et se trompe légèrement, et Jamie corrige en douceur
- Jamie lâche des exemples inattendus de sa vie personnelle ou de connaissances aléatoires
- Certains concepts tiennent en une phrase ; d'autres méritent une plongée de cinq minutes — parce que c'est comme ça qu'ils sont importants
- Alex avoue parfois "je suis perdu" ou "tu peux revenir sur la partie sur..."
- Ils font référence à des choses dites plus tôt dans la conversation naturellement
- Jamie dit parfois "je ne sais pas" ou "la recherche n'est pas claire là-dessus" quand c'est approprié
- Des moments d'humour qui naissent naturellement de la conversation, jamais forcés

QUALITÉ PÉDAGOGIQUE :
Ce podcast doit faire APPRENDRE les auditeurs, pas juste les divertir. Pour chaque concept important :
- Construire l'intuition avant de donner la définition
- Donner au moins un exemple qui rend l'abstrait concret
- Identifier l'erreur ou le contresens classique
- Quand c'est pertinent, créer des moments de "récupération active" : "Avant que je réponde, réfléchis deux secondes — qu'est-ce que tu t'attendrais à ce qui se passe si...?" (puis une courte pause avant de continuer)
- Terminer les sections majeures avec un "si tu retiens qu'une chose de ça" de synthèse

La règle du 80/20 : passe 80% du temps sur les 20% de concepts qui comptent le plus. Ne donne pas la même couverture à tout — certaines idées sont plus importantes que d'autres. Dis-le explicitement.

TON & STYLE :
- Style : ${config.style}
- Conversationnel, chaleureux, intellectuellement honnête
- Alex parle comme une personne intelligente et curieuse, pas comme un présentateur télé
- Jamie parle comme quelqu'un qui explique un truc fascinant à un ami lors d'un dîner
- Pas de méta-commentaire ("Dans ce podcast, on va couvrir..."). Commence juste la conversation.
- Aucune auto-référence IA. Jamais. Pas de "En tant qu'IA..." ou "D'après le document fourni..."
- Quand tu fais référence au contenu source, dis des choses comme "Dans ce cours..." ou "La façon dont ton prof le présente..." — jamais "Le document indique..."
- Tutoiement entre les speakers, ils sont amis
- Français naturel, parlé, pas littéraire

═══════════════════════════════════════════
FORMAT DE SORTIE
═══════════════════════════════════════════

Retourne un objet JSON :
{
  "title": "Un titre de podcast accrocheur et spécifique (pas générique)",
  "description": "2-3 phrases qui donnent envie d'écouter — comme une description de podcast sur Spotify",
  "topics": [
    {
      "id": "topic-1",
      "title": "Titre du sujet pour la navigation par chapitres",
      "summary": "Résumé en une phrase"
    }
  ],
  "segments": [
    {
      "speaker": "host",
      "text": "Ce qu'il dit — peut être un mot de réaction ou un monologue de plusieurs paragraphes",
      "topicId": "topic-1",
      "isQuestionBreakpoint": false
    }
  ]
}

RÈGLES CRITIQUES POUR LES SEGMENTS :
- Un segment est le tour de parole ininterrompu d'un speaker. Ça peut être 2 mots ("Ah ouais") ou 500 mots (une explication complète).
- Ne découpe PAS artificiellement un monologue continu d'un speaker en plusieurs segments. Si Jamie parle pendant 3 minutes d'affilée, c'est UN segment avec beaucoup de texte.
- Les réactions minimales de l'autre speaker pendant un long passage ("Mmh", "D'accord") doivent être leurs PROPRES segments courts — c'est comme ça que le système TTS multi-locuteurs sait qu'il faut changer de voix brièvement.
- Marque isQuestionBreakpoint comme true sur 4-8 segments où un auditeur pourrait naturellement vouloir faire pause et poser une question.
- Les topics servent à la navigation uniquement. La conversation doit couler sans interruption — ne relance pas l'énergie quand tu changes de sujet.

Génère environ ${targetWords} mots au total pour remplir ${config.targetDuration} minutes. Écris tout en français.

Maintenant crée le script du podcast.`
}

// ─── PREDICTED QUESTIONS ─────────────────────────────────────────────────────

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
