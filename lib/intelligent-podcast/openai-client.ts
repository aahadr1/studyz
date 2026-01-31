import OpenAI from 'openai'

/**
 * Singleton OpenAI client for podcast generation
 * This ensures we reuse the same client instance across all podcast modules
 */
let openaiInstance: OpenAI | null = null

export function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 3,
      timeout: 60000, // 60 seconds
    })
    
    console.log('[OpenAI] Client initialized successfully')
  }
  
  return openaiInstance
}

/**
 * Reset the OpenAI client instance (useful for testing)
 */
export function resetOpenAI(): void {
  openaiInstance = null
}
