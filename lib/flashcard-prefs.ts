/**
 * Client-side preferences for the flashcard experience.
 *
 * We deliberately keep all of this in localStorage so the user can star,
 * suspend, or tweak session settings without round-trips to the backend.
 * Nothing here is authoritative — it's purely UX state.
 */

export type StudyOrder = 'due_first' | 'random' | 'hardest_first' | 'newest_first' | 'oldest_first'
export type StudyMode = 'spaced' | 'cram' | 'starred' | 'again_only'
export type StudyDirection = 'front_to_back' | 'back_to_front' | 'mixed'

export interface SessionPrefs {
  mode: StudyMode
  order: StudyOrder
  direction: StudyDirection
  limit: number
  shuffle: boolean
  autoFlipSec: number  // 0 = disabled
  swipeEnabled: boolean
  showProgressDots: boolean
  ttsAutoplay: boolean
  selectedTags: string[]
}

export const DEFAULT_SESSION_PREFS: SessionPrefs = {
  mode: 'spaced',
  order: 'due_first',
  direction: 'front_to_back',
  limit: 30,
  shuffle: false,
  autoFlipSec: 0,
  swipeEnabled: true,
  showProgressDots: true,
  ttsAutoplay: false,
  selectedTags: [],
}

const SESSION_KEY = 'flashcards:sessionPrefs'
const STARRED_KEY_PREFIX = 'flashcards:starred:'
const SUSPENDED_KEY_PREFIX = 'flashcards:suspended:'
const VIEW_MODE_KEY = 'flashcards:viewMode'

function safeGet(key: string): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, value: string) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, value) } catch { /* quota / private mode */ }
}

/* -------------------------------- Session ------------------------------- */

export function loadSessionPrefs(): SessionPrefs {
  const raw = safeGet(SESSION_KEY)
  if (!raw) return { ...DEFAULT_SESSION_PREFS }
  try {
    return { ...DEFAULT_SESSION_PREFS, ...JSON.parse(raw) }
  } catch { return { ...DEFAULT_SESSION_PREFS } }
}

export function saveSessionPrefs(prefs: SessionPrefs) {
  safeSet(SESSION_KEY, JSON.stringify(prefs))
}

/* -------------------------- Starred / Suspended ------------------------- */

function readSet(key: string): Set<string> {
  const raw = safeGet(key)
  if (!raw) return new Set()
  try {
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch { return new Set() }
}
function writeSet(key: string, set: Set<string>) {
  safeSet(key, JSON.stringify(Array.from(set)))
}

export function loadStarred(deckId: string): Set<string> {
  return readSet(STARRED_KEY_PREFIX + deckId)
}
export function saveStarred(deckId: string, set: Set<string>) {
  writeSet(STARRED_KEY_PREFIX + deckId, set)
}
export function toggleStarred(deckId: string, cardId: string): Set<string> {
  const set = loadStarred(deckId)
  if (set.has(cardId)) set.delete(cardId)
  else set.add(cardId)
  saveStarred(deckId, set)
  return set
}

export function loadSuspended(deckId: string): Set<string> {
  return readSet(SUSPENDED_KEY_PREFIX + deckId)
}
export function saveSuspended(deckId: string, set: Set<string>) {
  writeSet(SUSPENDED_KEY_PREFIX + deckId, set)
}
export function toggleSuspended(deckId: string, cardId: string): Set<string> {
  const set = loadSuspended(deckId)
  if (set.has(cardId)) set.delete(cardId)
  else set.add(cardId)
  saveSuspended(deckId, set)
  return set
}

/* ---------------------------- Browse view mode -------------------------- */

export type ViewMode = 'grid' | 'list'

export function loadViewMode(): ViewMode {
  const raw = safeGet(VIEW_MODE_KEY)
  return raw === 'list' ? 'list' : 'grid'
}
export function saveViewMode(mode: ViewMode) {
  safeSet(VIEW_MODE_KEY, mode)
}
