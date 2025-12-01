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

export default getOpenAI
