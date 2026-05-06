// Types for intelligent interactive podcast system

export interface DocumentContent {
  id: string
  title: string
  content: string
  pageCount: number
  language: string
  extractedAt: string
}

export interface ConceptNode {
  id: string
  name: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  relatedConcepts: string[]
  firstMentionedAt?: number // timestamp in seconds
}

export interface KnowledgeGraph {
  concepts: ConceptNode[]
  relationships: Array<{
    from: string
    to: string
    type: 'requires' | 'related' | 'opposite' | 'example'
  }>
  embeddings: Record<string, number[]> // concept ID -> embedding vector
}

export interface PodcastChapter {
  id: string
  title: string
  startTime: number
  endTime: number
  concepts: string[] // concept IDs
  difficulty: 'easy' | 'medium' | 'hard'
  summary: string
}

export interface PodcastSegment {
  id: string
  chapterId: string
  speaker: 'host' | 'expert'
  text: string
  audioUrl?: string
  duration: number
  timestamp: number
  concepts: string[] // concepts discussed in this segment
  isQuestionBreakpoint: boolean // natural pause for questions
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface PredictedQuestion {
  id: string
  question: string
  answer: string
  relevantConcepts: string[]
  relatedSegments: string[] // segment IDs where this could be asked
  audioUrl?: string // pre-generated audio answer
}

export interface IntelligentPodcast {
  id: string
  userId: string
  title: string
  description: string
  duration: number // total duration in seconds
  language: string
  documentIds: string[]
  
  // Intelligence components
  knowledgeGraph: KnowledgeGraph
  chapters: PodcastChapter[]
  segments: PodcastSegment[]
  predictedQuestions: PredictedQuestion[]
  
  // Audio
  audioUrl: string
  transcriptUrl?: string
  
  // Metadata
  createdAt: string
  updatedAt: string
  status: 'generating' | 'ready' | 'error'
  generationProgress?: number // 0-100
}

export interface PodcastGenerationProgress {
  stage: 'extracting' | 'analyzing' | 'generating_script' | 'generating_audio' | 'post_processing' | 'completed' | 'error'
  progress: number // 0-100
  currentStep: string
  estimatedTimeRemaining?: number // seconds
  error?: string
}

export interface RealtimeConversationContext {
  podcastId: string
  currentSegmentId: string
  currentTimestamp: number
  recentSegments: PodcastSegment[] // last 3-5 segments for context
  relevantConcepts: ConceptNode[]
  knowledgeGraph: KnowledgeGraph
  documentContents: DocumentContent[]
}

export interface PodcastInterruption {
  id: string
  podcastId: string
  userId: string
  timestamp: number
  segmentId: string
  
  // User question (from voice)
  questionAudio?: string
  questionText: string
  
  // AI response
  responseText: string
  responseAudio?: string
  
  // Conversation (multi-turn support)
  conversationTurns: Array<{
    role: 'user' | 'assistant'
    text: string
    audioUrl?: string
    timestamp: number
  }>
  
  // Context at time of interruption
  conceptsDiscussed: string[]
  
  createdAt: string
}

export interface PodcastSession {
  id: string
  podcastId: string
  userId: string
  
  // Playback state
  currentTime: number
  playbackRate: number
  isPlaying: boolean
  
  // Progress
  completedSegments: string[]
  completedChapters: string[]
  progressPercentage: number
  
  // Interactions
  interruptions: string[] // interruption IDs
  bookmarks: Array<{
    id: string
    timestamp: number
    note?: string
  }>
  
  // Analytics
  pauseCount: number
  rewindCount: number
  difficultSegments: string[] // segments user struggled with
  
  createdAt: string
  updatedAt: string
  lastAccessedAt: string
}

export interface VoiceProfile {
  id: string
  role: 'host' | 'expert'
  name: string
  provider: 'gemini' | 'openai'
  voiceId: string
  description: string
  sampleAudioUrl?: string
}

export interface PodcastGenerationConfig {
  targetDuration: number // minutes (10-60)
  language: 'en' | 'fr' | 'es' | 'de' | 'auto'
  style: 'educational' | 'conversational' | 'technical' | 'storytelling'
  voiceProfiles: VoiceProfile[]
  includeChapters: boolean
  includePredictedQA: boolean
  numberOfPredictedQuestions: number
  backgroundMusic: boolean
  postProcessing: boolean
}

// Realtime API specific types
export interface RealtimeSessionConfig {
  voice: 'alloy' | 'echo' | 'shimmer'
  instructions: string
  context: RealtimeConversationContext
  turnDetection: {
    type: 'server_vad'
    threshold?: number
    silence_duration_ms?: number
  }
}

export interface RealtimeMessage {
  type: 'conversation.started' | 'conversation.item.created' | 'response.done' | 'error'
  data?: any
}

// Search and navigation
export interface SemanticSearchResult {
  segmentId: string
  timestamp: number
  relevance: number // 0-1
  snippet: string
  concepts: string[]
}

export interface SuggestedQuestion {
  id: string
  question: string
  relevantAt: number // timestamp when this question makes sense
  priority: 'low' | 'medium' | 'high'
}

// Analytics
export interface PodcastAnalytics {
  podcastId: string
  totalListens: number
  averageCompletionRate: number
  mostPausedSegments: Array<{
    segmentId: string
    pauseCount: number
  }>
  mostAskedQuestions: Array<{
    question: string
    count: number
  }>
  averageInterruptionsPerSession: number
  popularChapters: Array<{
    chapterId: string
    viewCount: number
  }>
}
