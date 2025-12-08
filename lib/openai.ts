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

// Advanced MCQ extraction prompt for mixed documents (typed text + embedded photos)
const ADVANCED_MCQ_EXTRACTION_PROMPT = `You are an EXPERT MCQ extraction specialist with advanced OCR and vision capabilities. Your task is to extract EVERY SINGLE multiple choice question from this document image with MAXIMUM accuracy.

## CRITICAL: MIXED CONTENT HANDLING

This document may contain:
1. **Clean typed/printed MCQs** - Standard formatted questions
2. **Handwritten MCQs** - Questions written by hand
3. **EMBEDDED PHOTOS OF MCQ TESTS** - Screenshots or camera photos of actual exam papers embedded within the document
4. **Low quality or blurry images** - Make extra effort to decipher these
5. **Partial questions** - Questions that may be cut off or continue from previous page

## YOUR MISSION

Extract ABSOLUTELY ALL MCQs from:
- The main document text
- ANY embedded images/photos visible in the document
- Handwritten content
- Even low-quality or partially visible questions

## IMAGE QUALITY HANDLING

For LOW QUALITY, BLURRY, or DIFFICULT-TO-READ content:
- Make your BEST effort to decipher the text
- Use context clues from surrounding text
- If a word is unclear, make an educated guess based on context
- NEVER skip a question just because it's hard to read
- Mark uncertain extractions with "[unclear: best guess]" notation if needed

## EXTRACTION RULES

1. **Question Text**: Capture the complete question, including any context or setup
2. **Options**: Extract ALL answer choices with their labels (A/B/C/D or 1/2/3/4)
3. **Correct Answer**: Look for:
   - Checkmarks, circles, or highlights
   - "Correct:", "Answer:", or similar markers
   - Underlined or bold correct options
   - If not marked, use your expert knowledge to determine the correct answer
4. **Explanation**: Generate a helpful explanation if none is provided

## SPECIAL CASES

- **Questions in embedded photos**: These are JUST AS IMPORTANT as typed questions. Analyze any visible exam paper photos carefully.
- **Numbered vs lettered options**: Normalize to A, B, C, D format
- **True/False questions**: Treat as A) True, B) False
- **Multiple pages in one image**: Extract questions from ALL visible content
- **Rotated or skewed content**: Still extract if readable

## OUTPUT FORMAT

Return JSON:
{
  "pageNumber": 1,
  "questions": [
    {
      "question": "Complete question text",
      "options": [
        {"label": "A", "text": "First option"},
        {"label": "B", "text": "Second option"},
        {"label": "C", "text": "Third option"},
        {"label": "D", "text": "Fourth option"}
      ],
      "correctOption": "B",
      "explanation": "Educational explanation of why B is correct"
    }
  ]
}

## FINAL REMINDER

- Extract EVERY question you can see, no matter the source or quality
- Don't skip questions from embedded photos/images
- Better to extract an imperfect question than to miss it entirely
- Be thorough - students depend on this for their studies`

/**
 * Extract MCQs from a page image using GPT-4o vision (best model for complex images)
 * Handles mixed documents with typed text AND embedded photos of tests
 * @param imageUrl - Public URL of the page image
 * @returns Extracted MCQs from the page
 */
export async function extractMcqsFromImage(imageUrl: string): Promise<ExtractedMcqPage> {
  const openai = getOpenAI()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o', // Best vision model for complex documents
    messages: [
      {
        role: 'system',
        content: ADVANCED_MCQ_EXTRACTION_PROMPT
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract ALL MCQs from this document image. Pay special attention to any embedded photos of test papers or low-quality sections.',
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'high', // Maximum detail for better OCR
            },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 8192, // Increased for more questions
    temperature: 0.2, // Lower temperature for more accurate extraction
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

/**
 * Deduplicate and merge extracted MCQs
 * Identifies duplicate questions and merges complementary information
 * @param questions - Array of extracted questions
 * @returns Deduplicated and merged questions
 */
export async function deduplicateAndMergeMcqs(
  questions: ExtractedMcqQuestion[]
): Promise<ExtractedMcqQuestion[]> {
  if (questions.length <= 1) return questions
  
  const openai = getOpenAI()
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an expert at identifying duplicate or near-duplicate MCQ questions and merging them intelligently.

Your task:
1. Identify questions that are duplicates or near-duplicates (same question, different wording)
2. Identify questions that complement each other (partial information that can be merged)
3. Merge duplicates, keeping the BEST/MOST COMPLETE version
4. Preserve unique questions as-is

When merging:
- Use the clearest, most complete question text
- Keep all unique answer options
- Prefer marked correct answers over guessed ones
- Combine explanations if they add value

Return the deduplicated list with merged questions.`
      },
      {
        role: 'user',
        content: `Review these ${questions.length} MCQ questions for duplicates and merge as needed:

${JSON.stringify(questions, null, 2)}

Return JSON:
{
  "questions": [
    {
      "question": "...",
      "options": [...],
      "correctOption": "...",
      "explanation": "..."
    }
  ],
  "mergeReport": {
    "originalCount": ${questions.length},
    "finalCount": X,
    "duplicatesRemoved": Y,
    "merges": ["Merged Q1 and Q5 - same question", ...]
  }
}`
      }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 8192,
    temperature: 0.1,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    return questions // Return original if dedup fails
  }

  try {
    const parsed = JSON.parse(content)
    console.log('MCQ Deduplication report:', parsed.mergeReport)
    return parsed.questions || questions
  } catch (error) {
    console.error('Failed to parse deduplication response:', error)
    return questions
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
