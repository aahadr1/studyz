export type CardType = 'basic' | 'cloze' | 'definition'

// Quality rating for SM-2: 0=Again, 1=Hard, 2=Hard+, 3=Good, 4=Easy, 5=Perfect
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5

export interface FlashcardDeck {
  id: string
  user_id: string
  name: string
  description: string | null
  source_pdf_name: string | null
  total_cards: number
  new_count: number
  due_count: number
  created_at: string
  updated_at: string
}

export interface FlashcardCard {
  id: string
  deck_id: string
  user_id: string
  card_type: CardType
  front: string
  back: string
  tags: string[]
  source_page: number | null
  hint: string | null
  created_at: string
  updated_at: string
  review?: FlashcardReview | null
}

export interface FlashcardReview {
  id: string
  card_id: string
  user_id: string
  interval: number
  ease_factor: number
  repetitions: number
  due_date: string
  last_quality: ReviewQuality | null
  created_at: string
  updated_at: string
}

// Card with SM-2 review state joined
export interface FlashcardCardWithReview extends FlashcardCard {
  review: FlashcardReview | null
}

// What the API returns for a study session
export interface StudySession {
  deck: FlashcardDeck
  dueCards: FlashcardCardWithReview[]
  newCards: FlashcardCardWithReview[]
  totalDue: number
}

// SM-2 result returned after a review
export interface SM2Result {
  interval: number
  easeFactor: number
  repetitions: number
  dueDate: string
}

// For AI generation — what GPT returns per page
export interface GeneratedFlashcard {
  card_type: CardType
  front: string
  back: string
  hint?: string
  tags?: string[]
  source_page: number
}

export interface GenerateFlashcardsResponse {
  deckId: string
  cardsCreated: number
  cards: FlashcardCard[]
}

// Study session result summary
export interface SessionSummary {
  total: number
  again: number
  hard: number
  good: number
  easy: number
  newIntervals: number[]
}
