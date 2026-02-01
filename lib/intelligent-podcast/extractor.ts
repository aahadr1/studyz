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

  // Step 3: Build relationships between concepts
  const relationships = await buildConceptRelationships(concepts, detectedLanguage)

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
    .map((doc) => `Document: ${doc.title}\n\n${doc.content.slice(0, 50000)}`)
    .join('\n\n---\n\n')

  const systemInstruction =
    language === 'fr'
      ? `Tu es un expert en analyse de contenu éducatif.

Extrais les concepts clés du contenu fourni.

CONTRAINTES:
- Identifie entre 25 et 80 concepts (selon la richesse du contenu).
- Chaque concept doit être UNIQUE, concret, et utile pour structurer un podcast long.
- IMPORTANT: crée des IDs stables au format "concept-1", "concept-2", ...

Retourne UNIQUEMENT un objet JSON:
{
  "concepts": [
    {
      "id": "concept-1",
      "name": "Nom du concept",
      "description": "Description claire (1-2 phrases)",
      "difficulty": "easy|medium|hard",
      "relatedConcepts": ["concept-2", "concept-7"]
    }
  ]
}`
      : `You are an expert in educational content analysis.

Extract the key concepts from the provided content.

CONSTRAINTS:
- Identify 25 to 80 concepts (depending on content richness).
- Each concept must be UNIQUE, concrete, and useful to structure a long-form podcast.
- IMPORTANT: create stable IDs in the form "concept-1", "concept-2", ...

Return ONLY a JSON object:
{
  "concepts": [
    {
      "id": "concept-1",
      "name": "Concept name",
      "description": "Clear description (1-2 sentences)",
      "difficulty": "easy|medium|hard",
      "relatedConcepts": ["concept-2", "concept-7"]
    }
  ]
}`

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
    return parsed.concepts || []
  } catch (error) {
    console.error('Failed to parse concepts:', error)
    return []
  }
}

/**
 * Build relationships between concepts
 */
async function buildConceptRelationships(
  concepts: ConceptNode[],
  language: string
): Promise<Array<{ from: string; to: string; type: 'requires' | 'related' | 'opposite' | 'example' }>> {
  const conceptsJson = JSON.stringify(
    concepts.map((c) => ({ id: c.id, name: c.name, description: c.description }))
  )

  const systemInstruction =
    language === 'fr'
      ? `Tu es un expert en création de graphes de connaissances.

Analyse les concepts fournis et identifie les relations entre eux.

Types de relations :
- "requires" : Concept A nécessite de comprendre Concept B d'abord
- "related" : Concepts liés mais indépendants
- "opposite" : Concepts opposés ou contrastants
- "example" : Concept A est un exemple de Concept B

Retourne un objet json :
{
  "relationships": [
    {"from": "concept-1", "to": "concept-2", "type": "requires"}
  ]
}

Crée autant de relations pertinentes que possible pour construire un graphe riche.`
      : `You are an expert in knowledge graph creation.

Analyze the provided concepts and identify relationships between them.

Relationship types:
- "requires": Concept A requires understanding Concept B first
- "related": Related but independent concepts
- "opposite": Opposing or contrasting concepts
- "example": Concept A is an example of Concept B

Return a json object:
{
  "relationships": [
    {"from": "concept-1", "to": "concept-2", "type": "requires"}
  ]
}

Create as many relevant relationships as possible to build a rich graph.`

  try {
    const raw = await runGemini3Flash({
      prompt: conceptsJson,
      systemInstruction,
      thinkingLevel: 'high',
      temperature: 0.3,
      topP: 0.95,
      maxOutputTokens: 8000,
    })
    const parsed = parseJsonObject<{ relationships?: any[] }>(raw)
    return parsed.relationships || []
  } catch (error) {
    console.error('Failed to parse relationships:', error)
    return []
  }
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
