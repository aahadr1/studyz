import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

// Lazy initialization
let _supabaseAdmin: any = null
function getSupabaseAdmin(): any {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return _openai
}

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

// POST: Generate pedagogical explanation for a page using vision
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pageNum: string }> }
) {
  const { id, pageNum } = await params
  const pageNumber = parseInt(pageNum)

  if (isNaN(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 })
  }

  try {
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get lesson
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('id, user_id, language, name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Get lesson documents
    const { data: documents } = await supabase
      .from('interactive_lesson_documents')
      .select('id, name, category, page_count')
      .eq('interactive_lesson_id', id)
      .eq('category', 'lesson')
      .order('created_at')

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'No documents found' }, { status: 404 })
    }

    // Find which document contains this page
    let currentDoc = null
    let localPageNumber = pageNumber

    for (const doc of documents) {
      if (localPageNumber <= doc.page_count) {
        currentDoc = doc
        break
      }
      localPageNumber -= doc.page_count
    }

    if (!currentDoc) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    // Get page image
    const { data: pageImage } = await getSupabaseAdmin()
      .from('interactive_lesson_page_images')
      .select('image_path')
      .eq('document_id', currentDoc.id)
      .eq('page_number', localPageNumber)
      .single()

    if (!pageImage?.image_path) {
      return NextResponse.json({ error: 'Page image not found' }, { status: 404 })
    }

    // Download image from storage
    const { data: imageData, error: downloadError } = await getSupabaseAdmin().storage
      .from('interactive-lessons')
      .download(pageImage.image_path)

    if (downloadError || !imageData) {
      return NextResponse.json({ error: 'Failed to download image' }, { status: 500 })
    }

    // Convert to base64
    const imageBuffer = Buffer.from(await imageData.arrayBuffer())
    const imageBase64 = imageBuffer.toString('base64')

    // Get checkpoint context for better explanation
    const { data: checkpoints } = await getSupabaseAdmin()
      .from('interactive_lesson_checkpoints')
      .select('title, summary')
      .eq('interactive_lesson_id', id)
      .lte('start_page', pageNumber)
      .gte('end_page', pageNumber)
      .order('checkpoint_order')

    const checkpointContext = checkpoints?.[0] 
      ? `\nContexte du cours: ${checkpoints[0].title} - ${checkpoints[0].summary}`
      : ''

    // Generate pedagogical explanation with GPT-4o-mini vision
    const langName = lesson.language === 'fr' ? 'français' : lesson.language === 'en' ? 'English' : lesson.language

    const prompt = `Tu es un professeur expert qui explique cette page de cours à un étudiant (page ${pageNumber} de "${lesson.name}").${checkpointContext}

OBJECTIF:
Explique cette page de manière pédagogique pour aider l'étudiant à comprendre:
- Les concepts clés présentés
- Les liens avec d'autres notions
- Les points d'attention importants
- Des exemples ou analogies si pertinent
- Les éléments visuels (diagrammes, schémas, tableaux)

STYLE:
- Ton clair et pédagogique (comme un professeur qui explique)
- En ${langName}
- 2-4 paragraphes maximum
- Mets en avant les concepts importants

RÉPONDS DIRECTEMENT AVEC L'EXPLICATION (pas de JSON, juste le texte).`

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { 
            type: 'image_url',
            image_url: { 
              url: `data:image/png;base64,${imageBase64}`,
              detail: 'high'
            }
          }
        ]
      }],
      max_tokens: 1500,
      temperature: 0.7,
    })

    const explanation = response.choices[0]?.message?.content || 'Aucune explication disponible.'

    return NextResponse.json({
      explanation,
      pageNumber,
      checkpoint: checkpoints?.[0] || null
    })

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/page/[pageNum]/explain:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate explanation' },
      { status: 500 }
    )
  }
}

