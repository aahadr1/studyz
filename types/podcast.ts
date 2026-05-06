// Types for interactive podcast feature

export interface PodcastSegment {
  id: string
  speaker: 'host' | 'guest'
  text: string
  audioUrl?: string
  duration?: number
  timestamp?: number
}

export interface PodcastScript {
  id: string
  title: string
  duration: number
  segments: PodcastSegment[]
  documentIds: string[]
  createdAt: string
}

export interface PodcastGenerationProgress {
  status: 'idle' | 'analyzing' | 'generating_script' | 'generating_audio' | 'completed' | 'error'
  currentSegment?: number
  totalSegments?: number
  message?: string
  error?: string
}

export interface PodcastInterruption {
  timestamp: number
  question: string
  answer: string
  audioUrl?: string
}

export interface PodcastSession {
  id: string
  scriptId: string
  currentSegmentId: string
  currentTime: number
  interruptions: PodcastInterruption[]
  isPlaying: boolean
}
