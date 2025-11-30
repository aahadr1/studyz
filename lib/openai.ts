/**
 * OpenAI Client
 * 
 * Provides a lazily-initialized OpenAI client for use throughout the application.
 */

import OpenAI from 'openai'

// Singleton instance
let openaiClient: OpenAI | null = null

/**
 * Get the OpenAI client instance.
 * Lazily initialized to avoid errors during build.
 */
export function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY environment variable')
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiClient
}

// For backwards compatibility
export const openai = {
  get chat() {
    return getOpenAI().chat
  }
}

export default openai

