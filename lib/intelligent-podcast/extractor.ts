import { DocumentContent, KnowledgeGraph, ConceptNode } from '@/types/intelligent-podcast'
import { parseJsonObject, runGemini3Flash } from './gemini-client'

/**
 * Extract and analyze content from documents to build a knowledge graph
 */
export async function extractAndAnalyze(
  documents: DocumentContent[]
): Promise<{
  knowledgeGraph: KnowledgeGraph
  enrichedDocuments: DocumentContent[]
  detectedLanguage: string
}> {
  // Step 1: Detect language from first document
  const detectedLanguage = await detectLanguage(documents[0].content)

  // Step 2: Extract key concepts from all documents
  const concepts = await extractConcepts(documents, detectedLanguage)

  // Step 3: Derive relationships locally from concept links (fewer LLM passes, faster pipeline).
  const relationships = deriveRelationshipsFromConcepts(concepts)

  // Step 4: Generate embeddings for semantic search
  const embeddings = await generateConceptEmbeddings(concepts)

  const knowledgeGraph: KnowledgeGraph = {
    concepts,
    relationships,
    embeddings,
  }

  return {
    knowledgeGraph,
    enrichedDocuments: documents,
    detectedLanguage,
  }
}

/**
 * Detect the primary language of the content
 */
async function detectLanguage(content: string): Promise<string> {
  const sample = content.slice(0, 8000)
  const systemInstruction = `Detect the language of the text and return ONLY the ISO 639-1 code (en, fr, es, de, etc.).
No punctuation. No extra words.`

  const out = await runGemini3Flash({
    prompt: sample,
    systemInstruction,
    thinkingLevel: 'low',
    temperature: 0,
    topP: 0.95,
    maxOutputTokens: 16,
  })

  const lang = out.trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 2)
  return lang || 'en'
}

/**
 * Extract key concepts from documents using Gemini 3 Flash
 */
async function extractConcepts(
  documents: DocumentContent[],
  language: string
): Promise<ConceptNode[]> {
  const combinedContent = documents
    // Prefer using the full transcription; keep a very high cap as a safety valve.
    .map((doc) => `Document: ${doc.title}\n\n${doc.content.slice(0, 200000)}`)
    .join('\n\n---\n\n')

  const systemInstruction =
    language === 'fr'
      ? `Tu analyses des contenus pédagogiques pour préparer un podcast de qualité.

Repère les idées réellement structurantes du document et formule des concepts utiles pour l'explication orale. Chaque concept doit être concret, distinct, et réutilisable dans une discussion approfondie.

Retourne uniquement un JSON brut avec une clé "concepts". Chaque concept contient "id", "name", "description", "difficulty" et "relatedConcepts". Les IDs suivent le format "concept-1", "concept-2", etc.`
      : `You analyze educational material for high-quality podcast creation.

Identify the genuinely central ideas in the source and express them as concepts that are useful in spoken teaching. Each concept should be concrete, distinct, and reusable in a deep conversation.

Return only raw JSON with a "concepts" array. Every concept includes "id", "name", "description", "difficulty", and "relatedConcepts". IDs should follow the "concept-1", "concept-2" format.`

  const raw = await runGemini3Flash({
    prompt: combinedContent,
    systemInstruction,
    thinkingLevel: 'high',
    temperature: 0.3,
    topP: 0.95,
    maxOutputTokens: 12000,
  })

  try {
    const parsed = parseJsonObject<{ concepts?: ConceptNode[] }>(raw)
    return normalizeConcepts(parsed.concepts || [])
  } catch (error) {
    console.error('Failed to parse concepts:', error)
    return []
  }
}

/**
 * Normalize model concepts into a stable shape for downstream generation.
 */
function normalizeConcepts(rawConcepts: ConceptNode[]): ConceptNode[] {
  const normalized: ConceptNode[] = []
  const usedIds = new Set<string>()

  for (let i = 0; i < rawConcepts.length; i++) {
    const c = rawConcepts[i] || ({} as ConceptNode)
    const fallbackId = `concept-${i + 1}`
    const baseId = String(c.id || fallbackId).trim().toLowerCase().replace(/[^a-z0-9\-]+/g, '-')
    const id = usedIds.has(baseId) ? `${baseId}-${i + 1}` : baseId
    usedIds.add(id)

    const name = String(c.name || '').trim()
    const description = String(c.description || '').trim()
    if (!name || !description) continue

    normalized.push({
      id,
      name,
      description,
      difficulty: c.difficulty === 'easy' || c.difficulty === 'hard' ? c.difficulty : 'medium',
      relatedConcepts: Array.isArray(c.relatedConcepts)
        ? c.relatedConcepts.map((r) => String(r || '').trim()).filter(Boolean)
        : [],
    })
  }

  return normalized.slice(0, 80)
}

/**
 * Build a lightweight graph locally from concept links.
 */
function deriveRelationshipsFromConcepts(
  concepts: ConceptNode[]
): Array<{ from: string; to: string; type: 'requires' | 'related' | 'opposite' | 'example' }> {
  const knownIds = new Set(concepts.map((c) => c.id))
  const edges = new Map<string, { from: string; to: string; type: 'requires' | 'related' | 'opposite' | 'example' }>()

  for (const concept of concepts) {
    for (const rawRelated of concept.relatedConcepts || []) {
      const target = String(rawRelated || '').trim()
      if (!target || !knownIds.has(target) || target === concept.id) continue

      const key = `${concept.id}::${target}::related`
      if (!edges.has(key)) {
        edges.set(key, { from: concept.id, to: target, type: 'related' })
      }
    }
  }

  return Array.from(edges.values())
}

/**
 * Generate lightweight local embeddings for semantic search (no external API).
 */
async function generateConceptEmbeddings(
  concepts: ConceptNode[]
): Promise<Record<string, number[]>> {
  const embeddings: Record<string, number[]> = {}
  for (const concept of concepts) {
    embeddings[concept.id] = textToEmbedding(`${concept.name}: ${concept.description}`)
  }
  return embeddings
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length > 2)
}

function hashToken(token: string): number {
  // djb2
  let hash = 5381
  for (let i = 0; i < token.length; i++) {
    hash = (hash * 33) ^ token.charCodeAt(i)
  }
  return hash >>> 0
}

function textToEmbedding(text: string, dims: number = 256): number[] {
  const vec = new Array(dims).fill(0)
  const tokens = tokenize(text)
  for (const tok of tokens) {
    const idx = hashToken(tok) % dims
    vec[idx] += 1
  }
  // L2 normalize
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < vec.length; i++) vec[i] = vec[i] / norm
  return vec
}

/**
 * Find similar concepts using embeddings (for semantic search)
 */
export async function findSimilarConcepts(
  query: string,
  knowledgeGraph: KnowledgeGraph,
  topK: number = 5
): Promise<ConceptNode[]> {
  const queryEmbedding = textToEmbedding(query)

  // Calculate cosine similarity with all concepts
  const similarities = knowledgeGraph.concepts.map((concept) => {
    const conceptEmbedding = knowledgeGraph.embeddings[concept.id]
    if (!conceptEmbedding) return { concept, similarity: 0 }

    const similarity = cosineSimilarity(queryEmbedding, conceptEmbedding)
    return { concept, similarity }
  })

  // Sort by similarity and return top K
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .map((s) => s.concept)
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
