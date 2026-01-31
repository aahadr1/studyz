import { DocumentContent, KnowledgeGraph, ConceptNode } from '@/types/intelligent-podcast'
import { getOpenAI } from './openai-client'

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
  const openai = getOpenAI()

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
  const openai = getOpenAI()
  
  const sample = content.slice(0, 2000)
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Detect the language of the text. Return only the ISO 639-1 code (en, fr, es, de, etc.)',
      },
      { role: 'user', content: sample },
    ],
    max_tokens: 10,
    temperature: 0,
  })

  return response.choices[0]?.message?.content?.trim().toLowerCase() || 'en'
}

/**
 * Extract key concepts from documents using GPT-4
 */
async function extractConcepts(
  documents: DocumentContent[],
  language: string
): Promise<ConceptNode[]> {
  const openai = getOpenAI()

  const combinedContent = documents
    .map((doc) => `Document: ${doc.title}\n\n${doc.content.slice(0, 8000)}`)
    .join('\n\n---\n\n')

  const systemPrompt =
    language === 'fr'
      ? `Tu es un expert en analyse de contenu éducatif.

Extrais les concepts clés du contenu fourni.

Pour CHAQUE concept, fournis :
1. Un nom court et précis
2. Une description claire (1-2 phrases)
3. Un niveau de difficulté (easy/medium/hard)
4. Des concepts liés (s'il y en a)

Retourne un objet json avec cette structure :
{
  "concepts": [
    {
      "id": "concept-1",
      "name": "Nom du concept",
      "description": "Description claire du concept",
      "difficulty": "medium",
      "relatedConcepts": []
    }
  ]
}

IMPORTANT : Identifie entre 10 et 30 concepts selon la complexité du contenu.`
      : `You are an expert in educational content analysis.

Extract the key concepts from the provided content.

For EACH concept, provide:
1. A short and precise name
2. A clear description (1-2 sentences)
3. A difficulty level (easy/medium/hard)
4. Related concepts (if any)

Return a json object with this structure:
{
  "concepts": [
    {
      "id": "concept-1",
      "name": "Concept name",
      "description": "Clear description of the concept",
      "difficulty": "medium",
      "relatedConcepts": []
    }
  ]
}

IMPORTANT: Identify between 10 and 30 concepts based on content complexity.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: combinedContent },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 4096,
    temperature: 0.3,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('Failed to extract concepts')
  }

  try {
    const parsed = JSON.parse(content)
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
  const openai = getOpenAI()

  const conceptsJson = JSON.stringify(
    concepts.map((c) => ({ id: c.id, name: c.name, description: c.description }))
  )

  const systemPrompt =
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

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: conceptsJson },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 4096,
    temperature: 0.3,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    return []
  }

  try {
    const parsed = JSON.parse(content)
    return parsed.relationships || []
  } catch (error) {
    console.error('Failed to parse relationships:', error)
    return []
  }
}

/**
 * Generate embeddings for semantic search
 */
async function generateConceptEmbeddings(
  concepts: ConceptNode[]
): Promise<Record<string, number[]>> {
  const openai = getOpenAI()

  const embeddings: Record<string, number[]> = {}

  // Generate embeddings in batches
  const batchSize = 20
  for (let i = 0; i < concepts.length; i += batchSize) {
    const batch = concepts.slice(i, i + batchSize)

    const texts = batch.map((c) => `${c.name}: ${c.description}`)

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    })

    batch.forEach((concept, idx) => {
      embeddings[concept.id] = response.data[idx].embedding
    })
  }

  return embeddings
}

/**
 * Find similar concepts using embeddings (for semantic search)
 */
export async function findSimilarConcepts(
  query: string,
  knowledgeGraph: KnowledgeGraph,
  topK: number = 5
): Promise<ConceptNode[]> {
  const openai = getOpenAI()

  // Generate embedding for query
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })

  const queryEmbedding = response.data[0].embedding

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
