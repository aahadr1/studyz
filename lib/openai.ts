import OpenAI from 'openai'

// Lazy initialization of OpenAI client to avoid build-time errors
let openaiInstance: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * Send a chat message with an optional page image context to GPT-4o-mini
 * @param messages - Previous conversation messages
 * @param userMessage - The new user message
 * @param pageImageUrl - Optional URL of the current page image
 * @returns The assistant's response
 */
export async function chatWithPageContext(
  messages: ChatMessage[],
  userMessage: string,
  pageImageUrl?: string
): Promise<string> {
  // Build the messages array for OpenAI
  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `You are a helpful study assistant helping a student understand their learning materials. 
You can see the current page of their document as an image. 
Answer questions about the content on the page, explain concepts, and help them learn.
Be concise but thorough. If you can't see relevant content on the current page, let the user know.`,
    },
  ]

  // Add previous messages (without images, just text)
  for (const msg of messages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      openaiMessages.push({
        role: msg.role,
        content: msg.content,
      })
    }
  }

  // Add the new user message with optional image
  if (pageImageUrl) {
    openaiMessages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: userMessage,
        },
        {
          type: 'image_url',
          image_url: {
            url: pageImageUrl,
            detail: 'high',
          },
        },
      ],
    })
  } else {
    openaiMessages.push({
      role: 'user',
      content: userMessage,
    })
  }

  // Call GPT-4o-mini with vision capability
  const openai = getOpenAI()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: openaiMessages,
    max_tokens: 1024,
    temperature: 0.7,
  })

  return response.choices[0]?.message?.content || 'Sorry, I could not generate a response.'
}

export interface ExtractedMcqQuestion {
  question: string
  options: Array<{ label: string; text: string }>
  correctOption: string
  explanation?: string
}

export interface ExtractedMcqPage {
  pageNumber: number
  questions: ExtractedMcqQuestion[]
}

/**
 * Extract MCQs from a page image using GPT-4o-mini vision
 * @param imageUrl - Public URL of the page image
 * @returns Extracted MCQs from the page
 */
export async function extractMcqsFromImage(imageUrl: string): Promise<ExtractedMcqPage> {
  const openai = getOpenAI()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are an expert at extracting Multiple Choice Questions (MCQs) from document images.

Analyze this image and extract ALL multiple choice questions you find. For each question, identify:
- The question text
- All answer options (typically labeled A, B, C, D, etc.)
- The correct answer option letter
- Any explanation provided (if available)

Return a JSON object with this exact structure:
{
  "pageNumber": 1,
  "questions": [
    {
      "question": "What is the capital of France?",
      "options": [
        {"label": "A", "text": "London"},
        {"label": "B", "text": "Paris"},
        {"label": "C", "text": "Berlin"},
        {"label": "D", "text": "Madrid"}
      ],
      "correctOption": "B",
      "explanation": "Paris is the capital and largest city of France."
    }
  ]
}

If no MCQs are found on the page, return an empty questions array.
Be thorough and extract ALL questions visible on the page.`,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'high',
            },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 4096,
    temperature: 0.3,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    return { pageNumber: 1, questions: [] }
  }

  try {
    const parsed = JSON.parse(content) as ExtractedMcqPage
    return parsed
  } catch (error) {
    console.error('Failed to parse MCQ extraction response:', error)
    return { pageNumber: 1, questions: [] }
  }
}

export interface LessonSection {
  id: string
  title: string
  content: string
  questionIds: string[]
}

export interface GeneratedLesson {
  title: string
  introduction: string
  sections: LessonSection[]
  conclusion: string
}

export interface QuestionForLesson {
  id: string
  question: string
  options: Array<{ label: string; text: string }>
  correctOption: string
  explanation?: string
}

/**
 * Generate a structured lesson from MCQ questions using GPT-4o
 * Each section covers concepts needed to answer specific questions
 * @param questions - Array of MCQ questions
 * @param setName - Name of the MCQ set for context
 * @returns Generated lesson with sections linked to questions
 */
export async function generateLessonFromMcqs(
  questions: QuestionForLesson[],
  setName: string
): Promise<GeneratedLesson> {
  const openai = getOpenAI()
  
  // Prepare questions summary for the prompt
  const questionsSummary = questions.map((q, i) => ({
    id: q.id,
    index: i + 1,
    question: q.question,
    correctAnswer: q.options.find(o => o.label === q.correctOption)?.text || '',
    explanation: q.explanation || ''
  }))

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert educational content creator. Your task is to create a comprehensive lesson that teaches the concepts needed to answer a set of multiple choice questions.

The lesson should:
1. Be structured with clear sections
2. Each section should cover the concepts needed to answer specific questions
3. Use clear, educational language
4. Include examples and explanations
5. Be engaging and easy to understand

IMPORTANT: Each section MUST specify which question IDs it helps answer. Group related questions together in sections.`
      },
      {
        role: 'user',
        content: `Create a lesson for "${setName}" based on these ${questions.length} MCQ questions:

${JSON.stringify(questionsSummary, null, 2)}

Return a JSON object with this exact structure:
{
  "title": "Lesson title",
  "introduction": "Brief introduction to the topic (2-3 sentences)",
  "sections": [
    {
      "id": "section-1",
      "title": "Section Title",
      "content": "Detailed educational content explaining the concepts. Use markdown formatting for better readability. Include key points, definitions, and examples.",
      "questionIds": ["id1", "id2"]
    }
  ],
  "conclusion": "Brief summary of key takeaways (2-3 sentences)"
}

Make sure EVERY question ID is included in at least one section's questionIds array.
Create 3-6 sections depending on how many distinct topics the questions cover.
Each section's content should be 150-300 words.`
      }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 8192,
    temperature: 0.7,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('Failed to generate lesson content')
  }

  try {
    const parsed = JSON.parse(content) as GeneratedLesson
    return parsed
  } catch (error) {
    console.error('Failed to parse lesson generation response:', error)
    throw new Error('Failed to parse generated lesson')
  }
}

export default getOpenAI
