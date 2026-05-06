import { DocumentContent, KnowledgeGraph, ConceptNode } from '@/types/intelligent-podcast'
import { parseJsonObject, runGemini3Flash } from './gemini-client'

/**
 * Analyze documents to understand their content and identify topics for the podcast.
 * This is a streamlined analysis that focuses on understanding what the document covers
 * and what complementary information would enrich the podcast.
 */
export async function extractAndAnalyze(
  documents: DocumentContent[]
): Promise<{
  knowledgeGraph: KnowledgeGraph
  enrichedDocuments: DocumentContent[]
  detectedLanguage: string
}> {
  // Step 1: Detect language
  const detectedLanguage = await detectLanguage(documents[0].content)

  // Step 2: Analyze content and identify topics with enrichment suggestions
  const analysis = await analyzeContent(documents, detectedLanguage)

  const knowledgeGraph: KnowledgeGraph = {
    concepts: analysis.topics,
    relationships: analysis.connections,
    embeddings: generateTopicEmbeddings(analysis.topics),
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
 * Analyze the document content to understand topics and suggest enrichments.
 * This creates a foundation for the podcast without over-analyzing.
 */
async function analyzeContent(
  documents: DocumentContent[],
  language: string
): Promise<{
  topics: ConceptNode[]
  connections: Array<{ from: string; to: string; type: 'requires' | 'related' | 'opposite' | 'example' }>
}> {
  const combinedContent = documents
    .map((doc) => `Document: ${doc.title}\n\n${doc.content.slice(0, 200000)}`)
    .join('\n\n---\n\n')

  const systemInstruction =
    language === 'fr'
      ? `Tu es un analyste de contenu préparant un podcast éducatif.

Ton rôle est de comprendre le document et d'identifier les sujets principaux qui seront discutés dans le podcast. Pour chaque sujet, suggère des enrichissements qui rendraient le contenu plus vivant et compréhensible.

Analyse le contenu et retourne un JSON avec :
- Les sujets principaux (topics) couverts par le document
- Pour chaque sujet, des suggestions d'enrichissement (exemples concrets, liens avec la vie quotidienne, analogies possibles, anecdotes potentielles)
- Les connexions naturelles entre les sujets

Format JSON attendu :
{
  "topics": [
    {
      "id": "topic-1",
      "name": "Nom du sujet",
      "description": "Ce que couvre ce sujet dans le document",
      "keyPoints": ["Point clé 1", "Point clé 2"],
      "enrichmentIdeas": ["Exemple concret possible", "Analogie avec la vie quotidienne", "Anecdote ou fait intéressant à ajouter"],
      "difficulty": "easy|medium|hard",
      "relatedConcepts": []
    }
  ],
  "connections": [
    {"from": "topic-1", "to": "topic-2", "type": "related", "explanation": "Comment ces sujets se connectent"}
  ]
}

Sois concis mais complet. Identifie tous les sujets importants sans en inventer.`
      : `You are a content analyst preparing an educational podcast.

Your role is to understand the document and identify the main topics that will be discussed in the podcast. For each topic, suggest enrichments that would make the content more engaging and understandable.

Analyze the content and return a JSON with:
- The main topics covered by the document
- For each topic, enrichment suggestions (concrete examples, real-life connections, possible analogies, potential anecdotes)
- Natural connections between topics

Expected JSON format:
{
  "topics": [
    {
      "id": "topic-1",
      "name": "Topic name",
      "description": "What this topic covers in the document",
      "keyPoints": ["Key point 1", "Key point 2"],
      "enrichmentIdeas": ["Possible concrete example", "Real-life analogy", "Interesting fact or anecdote to add"],
      "difficulty": "easy|medium|hard",
      "relatedConcepts": []
    }
  ],
  "connections": [
    {"from": "topic-1", "to": "topic-2", "type": "related", "explanation": "How these topics connect"}
  ]
}

Be concise but thorough. Identify all important topics without inventing any.`

  const raw = await runGemini3Flash({
    prompt: combinedContent,
    systemInstruction,
    thinkingLevel: 'high',
    temperature: 0.3,
    topP: 0.95,
    maxOutputTokens: 16000,
  })

  try {
    const parsed = parseJsonObject<{
      topics?: Array<{
        id?: string
        name?: string
        description?: string
        keyPoints?: string[]
        enrichmentIdeas?: string[]
        difficulty?: string
        relatedConcepts?: string[]
      }>
      connections?: Array<{
        from: string
        to: string
        type?: string
        explanation?: string
      }>
    }>(raw)

    const topics: ConceptNode[] = (parsed.topics || []).map((t, idx) => ({
      id: t.id || `topic-${idx + 1}`,
      name: t.name || `Topic ${idx + 1}`,
      description: t.description || '',
      difficulty: (t.difficulty === 'easy' || t.difficulty === 'hard' ? t.difficulty : 'medium') as 'easy' | 'medium' | 'hard',
      relatedConcepts: t.relatedConcepts || [],
      // Store enrichment ideas in the description for the script generator to use
      ...(t.keyPoints || t.enrichmentIdeas ? {
        description: `${t.description || ''}\n\nKey points: ${(t.keyPoints || []).join('; ')}\n\nEnrichment ideas: ${(t.enrichmentIdeas || []).join('; ')}`
      } : {})
    }))

    const connections = (parsed.connections || []).map(c => ({
      from: c.from,
      to: c.to,
      type: (c.type === 'requires' || c.type === 'opposite' || c.type === 'example' ? c.type : 'related') as 'requires' | 'related' | 'opposite' | 'example'
    }))

    return { topics, connections }
  } catch (error) {
    console.error('Failed to parse content analysis:', error)
    return { topics: [], connections: [] }
  }
}

/**
 * Generate lightweight local embeddings for semantic search (no external API).
 */
function generateTopicEmbeddings(topics: ConceptNode[]): Record<string, number[]> {
  const embeddings: Record<string, number[]> = {}
  for (const topic of topics) {
    embeddings[topic.id] = textToEmbedding(`${topic.name}: ${topic.description}`)
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

  const similarities = knowledgeGraph.concepts.map((concept) => {
    const conceptEmbedding = knowledgeGraph.embeddings[concept.id]
    if (!conceptEmbedding) return { concept, similarity: 0 }

    const similarity = cosineSimilarity(queryEmbedding, conceptEmbedding)
    return { concept, similarity }
  })

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .map((s) => s.concept)
}

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
