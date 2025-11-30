/**
 * Transcribe Image API Route
 * 
 * Receives a single image (as base64 or URL) and transcribes it using GPT-4o-mini vision.
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60

// Lazy OpenAI client
let openai: OpenAI | null = null
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  }
  return openai
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { imageBase64, imageUrl, pageNumber = 1, language = 'fr' } = body
    
    if (!imageBase64 && !imageUrl) {
      return NextResponse.json(
        { error: 'Either imageBase64 or imageUrl is required' },
        { status: 400 }
      )
    }
    
    console.log(`[TRANSCRIBE] Processing page ${pageNumber}...`)
    
    // Build the image content
    const imageContent = imageBase64
      ? { url: `data:image/png;base64,${imageBase64}` }
      : { url: imageUrl }
    
    // Call GPT-4o-mini vision
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: language === 'fr'
            ? `Tu es un moteur OCR précis. Tu reçois des images de pages de documents scannés.
               Tu dois extraire EXACTEMENT le texte que tu vois, en préservant les sauts de ligne.
               N'invente rien et ne corrige rien. Si une partie est illisible, écris "[...]".
               Décris également les diagrammes, tableaux, schémas ou images que tu vois.`
            : `You are a precise OCR engine. You receive images of scanned document pages.
               You must extract EXACTLY the text you see, preserving line breaks.
               Do not invent or correct anything. If a part is unreadable, write "[...]".
               Also describe any diagrams, tables, charts or images you see.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: language === 'fr'
                ? `Transcris exactement le texte de cette page ${pageNumber} et décris tous les éléments visuels.`
                : `Transcribe exactly the text from this page ${pageNumber} and describe all visual elements.`
            },
            {
              type: 'image_url',
              image_url: imageContent
            }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0.1,
    })
    
    const transcription = response.choices[0]?.message?.content || ''
    
    console.log(`[TRANSCRIBE] ✓ Page ${pageNumber}: ${transcription.length} chars`)
    
    return NextResponse.json({
      pageNumber,
      transcription,
      tokens: response.usage?.total_tokens || 0
    })
    
  } catch (error) {
    console.error('[TRANSCRIBE] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transcription failed' },
      { status: 500 }
    )
  }
}

