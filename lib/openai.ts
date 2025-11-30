import OpenAI from 'openai'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: openaiMessages,
    max_tokens: 1024,
    temperature: 0.7,
  })

  return response.choices[0]?.message?.content || 'Sorry, I could not generate a response.'
}

export default openai
