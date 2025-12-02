import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60

// Helper to create authenticated Supabase client
async function createAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set(name, value, options)
          } catch {
            // Called from Server Component
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', options)
          } catch {
            // Called from Server Component
          }
        },
      },
    }
  )
}

// Admin client for bypassing RLS
function getSupabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// OpenAI client
function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
}

// MiniMax Speech-02-Turbo Voice IDs
const VOICES = {
  en: {
    male: 'English_CaptivatingStoryteller',
    female: 'English_ConfidentWoman',
  },
  fr: {
    male: 'French_MaleNarrator',
    female: 'French_Female_News Anchor',
  },
}

// French Teacher System Prompt
const FRENCH_TEACHER_PROMPT = `Tu es un professeur expert, passionné et bienveillant. Tu vas expliquer cette page de cours à un étudiant francophone, comme si tu donnais un cours particulier.

## TON RÔLE

Tu regardes cette page avec l'étudiant et tu lui expliques son contenu de manière pédagogique et engageante. Ton explication sera lue à voix haute, donc utilise un style oral naturel.

## CONSIGNES ESSENTIELLES

### 1. Fais référence à la position des éléments sur la page
- "Regarde en haut de la page, tu vois ce titre..."
- "Au centre, il y a un schéma qui montre..."
- "En bas à gauche, tu trouveras..."
- "Sur la droite, remarque comment..."
- "Ce tableau que tu vois ici présente..."

### 2. Explique comme un vrai professeur
- Ne te contente pas de lire le contenu, ENSEIGNE-le
- Explique le POURQUOI, pas seulement le QUOI
- Utilise des analogies du quotidien pour rendre les concepts concrets
- Anticipe les questions que l'étudiant pourrait avoir
- Fais des liens avec des connaissances que l'étudiant possède déjà

### 3. Structure ton explication
- Commence par situer le contexte : "Sur cette page, nous allons voir..."
- Développe chaque concept important
- Termine par une synthèse : "Donc, retiens bien que..."

### 4. Rends l'explication vivante
- Utilise un ton chaleureux et encourageant
- Pose des questions rhétoriques : "Tu te demandes peut-être pourquoi...?"
- Utilise des formulations engageantes : "C'est fascinant parce que...", "Le point clé ici, c'est..."
- Fais des pauses naturelles avec des transitions

### 5. Adapte-toi au contenu visuel
- Si tu vois des graphiques, explique comment les lire
- Si tu vois des formules, décompose-les étape par étape
- Si tu vois des schémas, guide l'œil de l'étudiant à travers les éléments

## CE QU'IL NE FAUT PAS FAIRE
- Ne liste pas simplement le contenu
- N'utilise pas un ton robotique ou trop formel
- N'ignore pas les éléments visuels
- Ne saute pas d'explication en explication sans transition
- Ne parle pas de manière monotone

## FORMAT DE SORTIE
Écris ton explication en français, de manière fluide et naturelle, comme si tu parlais directement à l'étudiant. L'explication doit durer environ 1 à 2 minutes de lecture à voix haute (300-500 mots).`

// Cache for model version
let cachedVersion: string | null = null

async function getLatestVersion(apiToken: string): Promise<string> {
  if (cachedVersion) return cachedVersion

  try {
    const response = await fetch('https://api.replicate.com/v1/models/minimax/speech-02-turbo', {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    })
    
    if (response.ok) {
      const data = await response.json()
      cachedVersion = data.latest_version?.id
      if (cachedVersion) {
        return cachedVersion
      }
    }
  } catch (err) {
    console.error('[TTS] Failed to get latest version:', err)
  }

  // Fallback to known working version
  return '0544d2d437c9fdce5a5cf43a06b29f4df8a2c0bfef97f5c7f85a1f0c55b5eb06'
}

// Generate TTS audio using Replicate
async function generateTTS(text: string): Promise<string | null> {
  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) {
    console.error('[TTS] No REPLICATE_API_TOKEN')
    return null
  }

  try {
    const version = await getLatestVersion(apiToken)
    const voiceId = VOICES.fr.male

    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: version,
        input: {
          text: text.trim().substring(0, 10000),
          voice_id: voiceId,
          speed: 1,
          emotion: 'auto',
          pitch: 0,
          volume: 1,
          sample_rate: 32000,
          bitrate: 128000,
          audio_format: 'mp3',
          channel: 'mono',
          language_boost: 'French',
          english_normalization: false,
        }
      })
    })

    if (!createResponse.ok) {
      console.error('[TTS] Create failed:', createResponse.status)
      return null
    }

    let prediction = await createResponse.json()

    // Poll for completion (max 55 seconds to stay under function timeout)
    let attempts = 0
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 55) {
      await new Promise(r => setTimeout(r, 1000))
      
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Bearer ${apiToken}` }
      })
      
      prediction = await pollResponse.json()
      attempts++
    }

    if (prediction.status === 'succeeded' && prediction.output) {
      return prediction.output as string
    }

    console.error('[TTS] Failed or timed out:', prediction.status, prediction.error)
    return null
  } catch (err) {
    console.error('[TTS] Error:', err)
    return null
  }
}

// POST: Generate an oral explanation of a specific page in French
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthClient()
    const supabaseAdmin = getSupabaseAdmin()
    const openai = getOpenAI()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('id, name, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    const body = await request.json()
    const { page_number } = body

    if (!page_number || page_number < 1) {
      return NextResponse.json({ error: 'Valid page_number is required' }, { status: 400 })
    }

    // Get the page image
    const { data: documents } = await supabaseAdmin
      .from('interactive_lesson_documents')
      .select('id')
      .eq('interactive_lesson_id', id)
      .eq('category', 'lesson')

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'No lesson documents found' }, { status: 404 })
    }

    const docIds = documents.map(d => d.id)
    const { data: pageImage } = await supabaseAdmin
      .from('interactive_lesson_page_images')
      .select('id, image_path')
      .in('document_id', docIds)
      .eq('page_number', page_number)
      .single()

    if (!pageImage) {
      return NextResponse.json({ error: `Page ${page_number} not found` }, { status: 404 })
    }

    // Download image and convert to base64
    let imageBase64: string
    let mimeType = 'image/jpeg'
    
    try {
      if (pageImage.image_path.startsWith('http://') || pageImage.image_path.startsWith('https://')) {
        const imageResponse = await fetch(pageImage.image_path)
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.status}`)
        }
        const arrayBuffer = await imageResponse.arrayBuffer()
        imageBase64 = Buffer.from(arrayBuffer).toString('base64')
        mimeType = imageResponse.headers.get('content-type') || 'image/jpeg'
      } else {
        const { data: imageData, error: downloadError } = await supabaseAdmin.storage
          .from('interactive-lessons')
          .download(pageImage.image_path)
        
        if (downloadError || !imageData) {
          throw new Error(`Failed to download image from storage: ${downloadError?.message}`)
        }
        
        const arrayBuffer = await imageData.arrayBuffer()
        imageBase64 = Buffer.from(arrayBuffer).toString('base64')
        mimeType = pageImage.image_path.endsWith('.png') ? 'image/png' : 'image/jpeg'
      }
    } catch (downloadErr: any) {
      console.error(`Error downloading image for page ${page_number}:`, downloadErr)
      return NextResponse.json({ error: `Failed to download page image` }, { status: 500 })
    }

    // Generate explanation using GPT-4o Vision
    const dataUrl = `data:${mimeType};base64,${imageBase64}`
    
    console.log(`[ExplainPage] Generating French explanation for lesson ${id}, page ${page_number}`)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: FRENCH_TEACHER_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Explique cette page (page ${page_number}) à l'étudiant. Guide son regard à travers les différents éléments et aide-le à comprendre le contenu en profondeur.` },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.7
    })

    const explanation = response.choices[0]?.message?.content || ''

    if (!explanation) {
      return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 })
    }

    console.log(`[ExplainPage] Generated ${explanation.length} chars, now generating TTS...`)

    // Generate TTS audio in French
    const audioUrl = await generateTTS(explanation)

    console.log(`[ExplainPage] TTS result:`, audioUrl ? 'success' : 'failed')

    // Save the explanation as a message in the database
    const messageContent = `🎧 **Explication de la page ${page_number}**\n\n${explanation}`
    await supabaseAdmin
      .from('interactive_lesson_messages')
      .insert({
        interactive_lesson_id: id,
        role: 'assistant',
        content: messageContent,
        page_context: page_number,
        audio_url: audioUrl || null,
      })

    return NextResponse.json({
      success: true,
      page_number,
      explanation,
      audioUrl,
    })

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/explain-page:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

