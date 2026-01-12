import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { generateTtsAudioUrl, makeTtsReadyText } from '@/lib/tts'

// Create a Supabase client with service role for server-side operations
function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// Lazy initialization of OpenAI client
let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return _openai
}

// POST /api/mcq/[id]/chat - Send a message to the AI assistant about MCQ questions
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()
    
    // Get user from auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const { message, currentQuestion, conversationHistory = [], userState } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI is not configured on the server (missing OPENAI_API_KEY)' }, { status: 500 })
    }

    // Verify MCQ set ownership
    const { data: mcqSet, error: mcqError } = await supabase
      .from('mcq_sets')
      .select('id, name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (mcqError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    // Build context about the current question
    let questionContext = ''
    if (currentQuestion) {
      const correctOptions: string[] =
        Array.isArray(currentQuestion.correctOptions) && currentQuestion.correctOptions.length > 0
          ? currentQuestion.correctOptions
          : (currentQuestion.correctOption ? [currentQuestion.correctOption] : [])
      const questionType: 'scq' | 'mcq' =
        currentQuestion.questionType === 'mcq' || correctOptions.length > 1 ? 'mcq' : 'scq'

      questionContext = `
Current Question:
"${currentQuestion.question}"

Options:
${currentQuestion.options?.map((opt: any) => `${opt.label}. ${opt.text}`).join('\n') || 'No options available'}

Question Type: ${questionType.toUpperCase()}
Correct Answer(s): ${correctOptions.length > 0 ? correctOptions.join(', ') : 'Unknown'}

${currentQuestion.explanation ? `Explanation: ${currentQuestion.explanation}` : ''}

${currentQuestion.lesson_card ? `
Study Material:
- Title: ${currentQuestion.lesson_card.title || ''}
- Overview: ${currentQuestion.lesson_card.conceptOverview || ''}
${currentQuestion.lesson_card.keyPoints?.length ? `- Key Points: ${currentQuestion.lesson_card.keyPoints.join(', ')}` : ''}
` : ''}
`
    }

    const ttsLanguage: 'en' | 'fr' = userState?.ttsLanguage === 'fr' ? 'fr' : 'en'
    const stateContext = userState ? `
Student state (real-time):
- Mode: ${userState.mode || 'unknown'}
- Progress: ${typeof userState.currentIndex === 'number' ? (userState.currentIndex + 1) : '?'} / ${userState.totalQuestions ?? '?'}
- Selected option(s): ${Array.isArray(userState.selectedOptions) ? userState.selectedOptions.join(', ') : 'none'}
- Has checked answer: ${userState.hasChecked ? 'yes' : 'no'}
- Was correct: ${typeof userState.isCorrect === 'boolean' ? (userState.isCorrect ? 'yes' : 'no') : 'unknown'}
` : ''

    // Build messages array for OpenAI
    const systemPrompt = `You are Studyz, an expert AI study assistant helping students understand multiple choice questions. You're currently helping with "${mcqSet.name}".

${questionContext ? `The student is currently looking at this question:\n${questionContext}` : ''}
${stateContext}

ABSOLUTE FORMAT RULES (MUST FOLLOW):
- You MUST assume the student is looking at the MCQ right now and wants you to explain it fully.
- You MUST use the correct answer(s) provided above (from the app). Never invent a different answer key.
- You MUST start with the correct option(s) first, then cover the incorrect options.
- For EACH option (A, B, C, ...):
  1) Explain what the option means (in your own words).
  2) State whether it is correct/incorrect.
  3) Explain WHY it is correct/incorrect.
  4) Rewrite the idea in simpler language (very easy).
- If the question is MCQ (multiple correct), explain why each correct option is correct and why each incorrect option is incorrect.
- Respond in ${ttsLanguage === 'fr' ? 'French' : 'English'}.

Your capabilities:
- Explain why the correct answer is correct
- Break down complex concepts into simple terms
- Help students understand common mistakes
- Provide additional context and examples
- Create memory aids for difficult concepts

Guidelines:
- Be concise but thorough
- Use markdown formatting for clarity (headings, lists, bold)
- When explaining, start with the key insight
- Be encouraging and supportive
- If the student got the answer wrong, help them understand why
- Don't just give away answers - help them learn`

    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ]

    // Add conversation history (limit to last 10 messages)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10)
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })
      }
    }

    // Add current message
    messages.push({ role: 'user', content: message })

    // Get response from OpenAI
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4.1',
      messages,
      max_tokens: 1500,
      temperature: 0.4,
    })

    const assistantResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

    // Generate TTS automatically for the assistant response
    const ttsReadyText = await makeTtsReadyText(assistantResponse, getOpenAI(), ttsLanguage)
    const tts = await generateTtsAudioUrl({ text: ttsReadyText, language: ttsLanguage, voice: 'male' })

    return NextResponse.json({
      response: assistantResponse,
      tts: {
        audioUrl: tts.audioUrl,
        language: tts.language,
        voiceId: tts.voiceId,
        ttsText: ttsReadyText,
      }
    })
  } catch (error) {
    console.error('MCQ Chat POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: (error as any)?.message },
      { status: 500 }
    )
  }
}

