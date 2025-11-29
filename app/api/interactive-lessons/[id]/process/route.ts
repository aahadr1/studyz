import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for processing

// Lazy initialization of admin client
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

interface PageText {
  document_id: string
  page_number: number
  text_content: string
}

interface Section {
  title: string
  start_page: number
  end_page: number
  summary: string
  key_points: string[]
}

interface Question {
  question: string
  choices: string[]
  correct_index: number
  explanation: string
}

// Setup minimal browser globals required by pdfjs-dist (used by pdf-parse)
function setupPdfParseGlobals() {
  if (typeof global !== 'undefined') {
    // @ts-ignore
    if (!global.DOMMatrix) {
      // @ts-ignore
      global.DOMMatrix = class DOMMatrix {
        constructor() { return [1, 0, 0, 1, 0, 0] }
      }
    }
    // @ts-ignore
    if (!global.Path2D) {
      // @ts-ignore
      global.Path2D = class Path2D { constructor() {} }
    }
    // @ts-ignore
    if (!global.CanvasRenderingContext2D) {
      // @ts-ignore
      global.CanvasRenderingContext2D = class CanvasRenderingContext2D {}
    }
    // @ts-ignore
    if (!global.ImageData) {
      // @ts-ignore
      global.ImageData = class ImageData { constructor() {} }
    }
  }
}

// Extract text from PDF - with proper global setup
async function extractPdfText(buffer: Buffer): Promise<string[]> {
  try {
    // Setup globals before requiring pdf-parse
    setupPdfParseGlobals()
    
    // Use require for CommonJS module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    
    // Parse PDF
    const data = await pdfParse(buffer)
    
    const fullText = data.text || ''
    const totalPages = data.numpages || 1
    
    console.log(`PDF parsed: ${totalPages} pages, ${fullText.length} chars`)
    
    if (!fullText) {
      console.log('No text extracted from PDF')
      return Array(totalPages).fill('(No text content)')
    }
    
    // Simple heuristic: split text roughly by page count
    const avgCharsPerPage = Math.ceil(fullText.length / Math.max(totalPages, 1))
    const pages: string[] = []
    
    for (let i = 0; i < totalPages; i++) {
      const start = i * avgCharsPerPage
      const end = Math.min((i + 1) * avgCharsPerPage, fullText.length)
      const pageText = fullText.slice(start, end).trim()
      pages.push(pageText || `(Page ${i + 1})`)
    }
    
    return pages
  } catch (error: any) {
    console.error('Error parsing PDF:', error?.message || error)
    // Return placeholder text instead of throwing
    return ['(PDF text extraction failed - will use AI vision if available)']
  }
}

// Generate sections using LLM
async function generateSections(pageTexts: PageText[], language: string): Promise<Section[]> {
  // Combine page texts with page markers
  const combinedText = pageTexts
    .sort((a, b) => a.page_number - b.page_number)
    .map(p => `--- PAGE ${p.page_number} ---\n${p.text_content}`)
    .join('\n\n')

  // Truncate if too long (GPT-4 context limit)
  const maxChars = 100000
  const truncatedText = combinedText.length > maxChars 
    ? combinedText.slice(0, maxChars) + '\n... [truncated]'
    : combinedText

  const prompt = `You are analyzing a lesson document to create a structured learning path.

Given the following document content with page markers, identify logical sections for study.
The document is in ${language === 'fr' ? 'French' : language === 'en' ? 'English' : language}.

For each section:
1. Give it a clear, descriptive title (in the document's language)
2. Specify the start_page and end_page (1-indexed)
3. Write a concise summary (2-3 sentences)
4. List 3-5 key points students should understand

IMPORTANT: 
- Sections should be logical units (chapters, topics, concepts)
- Each section should cover 2-5 pages typically
- Don't create too many sections (aim for 3-8 sections total)
- Page numbers must be valid (within the document range)

Document content:
${truncatedText}

Respond with a JSON array only, no markdown, no explanation:
[
  {
    "title": "Section Title",
    "start_page": 1,
    "end_page": 3,
    "summary": "Brief summary of this section...",
    "key_points": ["Point 1", "Point 2", "Point 3"]
  }
]`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 4000,
    temperature: 0.3,
  })

  const content = response.choices[0]?.message?.content || '[]'
  
  try {
    // Clean the response (remove markdown code blocks if present)
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned)
  } catch (error) {
    console.error('Error parsing sections JSON:', content)
    throw new Error('Failed to parse LLM response for sections')
  }
}

// Generate QCM questions for a section
async function generateQuestions(
  sectionTitle: string,
  sectionSummary: string,
  pageTexts: string[],
  language: string,
  questionCount: number = 5
): Promise<Question[]> {
  const combinedText = pageTexts.join('\n\n').slice(0, 15000) // Limit context

  const prompt = `You are creating quiz questions to test student understanding.

Section: ${sectionTitle}
Summary: ${sectionSummary}
Language: ${language === 'fr' ? 'French' : language === 'en' ? 'English' : language}

Content to test:
${combinedText}

Create ${questionCount} multiple-choice questions (MCQ) in the document's language.

Requirements:
1. Questions should test understanding, not just memorization
2. Each question has exactly 4 choices
3. Only ONE choice is correct
4. Include plausible distractors (wrong but believable answers)
5. Provide a brief explanation for why the correct answer is right

Respond with a JSON array only:
[
  {
    "question": "Question text here?",
    "choices": ["Choice A", "Choice B", "Choice C", "Choice D"],
    "correct_index": 0,
    "explanation": "Explanation why Choice A is correct..."
  }
]`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 3000,
    temperature: 0.5,
  })

  const content = response.choices[0]?.message?.content || '[]'
  
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned)
  } catch (error) {
    console.error('Error parsing questions JSON:', content)
    return []
  }
}

// Generate course content for MCQ-only mode
async function generateCourseContent(
  questions: Question[],
  sectionTitle: string,
  language: string
): Promise<string> {
  const questionsText = questions
    .map((q, i) => `Q${i+1}: ${q.question}\nAnswer: ${q.choices[q.correct_index]}\nExplanation: ${q.explanation}`)
    .join('\n\n')

  const prompt = `Based on these quiz questions and their answers, create educational content for a section titled "${sectionTitle}".

Language: ${language === 'fr' ? 'French' : language === 'en' ? 'English' : language}

Questions and answers:
${questionsText}

Create comprehensive lesson content that:
1. Explains the concepts being tested
2. Uses clear, educational language
3. Includes examples where helpful
4. Is structured with headings and paragraphs

Output as clean HTML (use <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em> tags).
Do not include <html>, <head>, or <body> tags.`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 3000,
    temperature: 0.7,
  })

  return response.choices[0]?.message?.content || '<p>Content generation failed.</p>'
}

// Parse MCQ from uploaded document (simplified - looks for Q/A patterns)
async function parseMcqFromText(text: string): Promise<Question[]> {
  const prompt = `Extract multiple choice questions from this text.

Text:
${text.slice(0, 20000)}

For each question found, extract:
- The question text
- All choices (should be 4 if possible)
- The correct answer index (0-based)
- An explanation if provided, or generate one

Respond with a JSON array only:
[
  {
    "question": "Question text",
    "choices": ["A", "B", "C", "D"],
    "correct_index": 0,
    "explanation": "Why this is correct"
  }
]

If no valid MCQs are found, return an empty array [].`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 4000,
    temperature: 0.3,
  })

  const content = response.choices[0]?.message?.content || '[]'
  
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return []
  }
}

// Match questions to sections based on content similarity
async function matchQuestionsToSections(
  questions: Question[],
  sections: Array<{ id: string; title: string; summary: string }>,
  language: string
): Promise<Map<string, Question[]>> {
  const result = new Map<string, Question[]>()
  sections.forEach(s => result.set(s.id, []))

  if (questions.length === 0 || sections.length === 0) {
    return result
  }

  const sectionsInfo = sections.map(s => `ID: ${s.id}\nTitle: ${s.title}\nSummary: ${s.summary}`).join('\n\n')
  const questionsInfo = questions.map((q, i) => `${i}: ${q.question}`).join('\n')

  const prompt = `Match each question to the most relevant section.

Sections:
${sectionsInfo}

Questions:
${questionsInfo}

Respond with a JSON object mapping question index to section ID:
{"0": "section-id-1", "1": "section-id-2", ...}`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
    temperature: 0.2,
  })

  const content = response.choices[0]?.message?.content || '{}'
  
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const mapping = JSON.parse(cleaned)
    
    Object.entries(mapping).forEach(([qIndex, sectionId]) => {
      const idx = parseInt(qIndex)
      if (idx >= 0 && idx < questions.length && result.has(sectionId as string)) {
        result.get(sectionId as string)!.push(questions[idx])
      }
    })
  } catch {
    // If matching fails, distribute questions evenly
    questions.forEach((q, i) => {
      const sectionIndex = i % sections.length
      const sectionId = sections[sectionIndex].id
      result.get(sectionId)!.push(q)
    })
  }

  return result
}

// POST: Start processing an interactive lesson
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get lesson and verify ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('*, interactive_lesson_documents(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json(
        { error: 'Interactive lesson not found' },
        { status: 404 }
      )
    }

    if (lesson.status === 'processing') {
      return NextResponse.json(
        { error: 'Lesson is already being processed' },
        { status: 400 }
      )
    }

    if (lesson.status === 'ready') {
      return NextResponse.json(
        { error: 'Lesson has already been processed' },
        { status: 400 }
      )
    }

    const documents = lesson.interactive_lesson_documents || []
    const lessonDocs = documents.filter((d: any) => d.category === 'lesson')
    const mcqDocs = documents.filter((d: any) => d.category === 'mcq')

    // Determine mode based on documents
    const mode = lessonDocs.length > 0 ? 'document_based' : 'mcq_only'

    if (mode === 'mcq_only' && mcqDocs.length === 0) {
      return NextResponse.json(
        { error: 'No documents uploaded. Please upload lesson documents or MCQ files.' },
        { status: 400 }
      )
    }

    // Update status to processing
    await getSupabaseAdmin()
      .from('interactive_lessons')
      .update({ status: 'processing', mode })
      .eq('id', id)

    try {
      // ===== DOCUMENT-BASED MODE =====
      if (mode === 'document_based') {
        const allPageTexts: PageText[] = []

        // Step 1: Extract text from each lesson document
        for (const doc of lessonDocs) {
          console.log(`Processing document: ${doc.name}`)
          
          // Download file
          const { data: fileData, error: downloadError } = await getSupabaseAdmin().storage
            .from('interactive-lessons')
            .download(doc.file_path)

          if (downloadError || !fileData) {
            console.error('Error downloading file:', downloadError)
            continue
          }

          const buffer = Buffer.from(await fileData.arrayBuffer())
          
          // Extract text
          let pages: string[] = []
          if (doc.file_type === 'pdf') {
            pages = await extractPdfText(buffer)
          } else {
            // For other formats, treat as single page
            pages = [buffer.toString('utf-8')]
          }

          // Update page count
          await getSupabaseAdmin()
            .from('interactive_lesson_documents')
            .update({ page_count: pages.length })
            .eq('id', doc.id)

          // Store page texts
          for (let i = 0; i < pages.length; i++) {
            const pageText: PageText = {
              document_id: doc.id,
              page_number: i + 1,
              text_content: pages[i]
            }
            allPageTexts.push(pageText)

            await getSupabaseAdmin()
              .from('interactive_lesson_page_texts')
              .upsert({
                document_id: doc.id,
                page_number: i + 1,
                text_content: pages[i]
              }, {
                onConflict: 'document_id,page_number'
              })
          }
        }

        // Step 2: Generate sections using LLM
        console.log('Generating sections...')
        const sections = await generateSections(allPageTexts, lesson.language)

        // Step 3: Store sections
        const createdSections: Array<{ id: string; title: string; summary: string; start_page: number; end_page: number }> = []
        
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i]
          const { data: createdSection, error: sectionError } = await getSupabaseAdmin()
            .from('interactive_lesson_sections')
            .insert({
              interactive_lesson_id: id,
              document_id: lessonDocs[0]?.id, // Associate with first lesson doc
              section_order: i + 1,
              title: section.title,
              start_page: section.start_page,
              end_page: section.end_page,
              summary: section.summary,
              key_points: section.key_points,
              pass_threshold: 70
            })
            .select()
            .single()

          if (!sectionError && createdSection) {
            createdSections.push({
              id: createdSection.id,
              title: section.title,
              summary: section.summary,
              start_page: section.start_page,
              end_page: section.end_page
            })
          }
        }

        // Step 4: Handle MCQ
        let uploadedQuestions: Question[] = []
        
        // Parse MCQ from uploaded documents if any
        for (const mcqDoc of mcqDocs) {
          const { data: fileData } = await getSupabaseAdmin().storage
            .from('interactive-lessons')
            .download(mcqDoc.file_path)

          if (fileData) {
            const buffer = Buffer.from(await fileData.arrayBuffer())
            let text = ''
            
            if (mcqDoc.file_type === 'pdf') {
              const pages = await extractPdfText(buffer)
              text = pages.join('\n')
            } else {
              text = buffer.toString('utf-8')
            }

            const parsedQuestions = await parseMcqFromText(text)
            uploadedQuestions.push(...parsedQuestions)
          }
        }

        // Match uploaded questions to sections or generate new ones
        if (uploadedQuestions.length > 0) {
          console.log(`Matching ${uploadedQuestions.length} uploaded questions to sections...`)
          const questionsBySection = await matchQuestionsToSections(
            uploadedQuestions,
            createdSections,
            lesson.language
          )

          // Store matched questions and generate more if needed
          for (const section of createdSections) {
            const sectionQuestions = questionsBySection.get(section.id) || []
            
            // If section has fewer than 3 questions, generate more
            if (sectionQuestions.length < 3) {
              const pageTexts = allPageTexts
                .filter(p => p.page_number >= section.start_page && p.page_number <= section.end_page)
                .map(p => p.text_content)
              
              const additionalQuestions = await generateQuestions(
                section.title,
                section.summary,
                pageTexts,
                lesson.language,
                5 - sectionQuestions.length
              )
              sectionQuestions.push(...additionalQuestions)
            }

            // Store questions
            for (let i = 0; i < sectionQuestions.length; i++) {
              const q = sectionQuestions[i]
              await getSupabaseAdmin()
                .from('interactive_lesson_questions')
                .insert({
                  section_id: section.id,
                  question: q.question,
                  choices: q.choices,
                  correct_index: q.correct_index,
                  explanation: q.explanation,
                  question_order: i + 1
                })
            }
          }
        } else {
          // Generate questions for each section
          console.log('Generating questions for each section...')
          for (const section of createdSections) {
            const pageTexts = allPageTexts
              .filter(p => p.page_number >= section.start_page && p.page_number <= section.end_page)
              .map(p => p.text_content)

            const questions = await generateQuestions(
              section.title,
              section.summary,
              pageTexts,
              lesson.language,
              5
            )

            for (let i = 0; i < questions.length; i++) {
              const q = questions[i]
              await getSupabaseAdmin()
                .from('interactive_lesson_questions')
                .insert({
                  section_id: section.id,
                  question: q.question,
                  choices: q.choices,
                  correct_index: q.correct_index,
                  explanation: q.explanation,
                  question_order: i + 1
                })
            }
          }
        }
      }
      // ===== MCQ-ONLY MODE =====
      else {
        // Parse all MCQ documents
        let allQuestions: Question[] = []
        
        for (const mcqDoc of mcqDocs) {
          const { data: fileData } = await getSupabaseAdmin().storage
            .from('interactive-lessons')
            .download(mcqDoc.file_path)

          if (fileData) {
            const buffer = Buffer.from(await fileData.arrayBuffer())
            let text = ''
            
            if (mcqDoc.file_type === 'pdf') {
              const pages = await extractPdfText(buffer)
              text = pages.join('\n')
            } else {
              text = buffer.toString('utf-8')
            }

            const parsedQuestions = await parseMcqFromText(text)
            allQuestions.push(...parsedQuestions)
          }
        }

        if (allQuestions.length === 0) {
          throw new Error('No valid MCQ questions found in uploaded documents')
        }

        // Group questions into sections (5-10 questions per section)
        const questionsPerSection = 5
        const sectionCount = Math.ceil(allQuestions.length / questionsPerSection)

        for (let i = 0; i < sectionCount; i++) {
          const sectionQuestions = allQuestions.slice(
            i * questionsPerSection,
            (i + 1) * questionsPerSection
          )

          // Generate section title and content from questions
          const sectionTitle = `Section ${i + 1}`
          const content = await generateCourseContent(sectionQuestions, sectionTitle, lesson.language)

          // Create section
          const { data: section, error: sectionError } = await getSupabaseAdmin()
            .from('interactive_lesson_sections')
            .insert({
              interactive_lesson_id: id,
              section_order: i + 1,
              title: sectionTitle,
              start_page: 1, // Not applicable for mcq_only
              end_page: 1,
              summary: `This section covers ${sectionQuestions.length} questions.`,
              key_points: sectionQuestions.slice(0, 3).map(q => q.question.slice(0, 50) + '...'),
              pass_threshold: 70
            })
            .select()
            .single()

          if (!sectionError && section) {
            // Store generated content
            await getSupabaseAdmin()
              .from('interactive_lesson_generated_content')
              .insert({
                section_id: section.id,
                content_html: content
              })

            // Store questions
            for (let j = 0; j < sectionQuestions.length; j++) {
              const q = sectionQuestions[j]
              await getSupabaseAdmin()
                .from('interactive_lesson_questions')
                .insert({
                  section_id: section.id,
                  question: q.question,
                  choices: q.choices,
                  correct_index: q.correct_index,
                  explanation: q.explanation,
                  question_order: j + 1
                })
            }
          }
        }
      }

      // Update status to ready
      await getSupabaseAdmin()
        .from('interactive_lessons')
        .update({ status: 'ready', error_message: null })
        .eq('id', id)

      return NextResponse.json({ 
        success: true,
        message: 'Processing completed successfully'
      })

    } catch (processingError: any) {
      console.error('Processing error:', processingError)
      
      // Update status to error
      await getSupabaseAdmin()
        .from('interactive_lessons')
        .update({ 
          status: 'error',
          error_message: processingError.message || 'Processing failed'
        })
        .eq('id', id)

      return NextResponse.json(
        { error: processingError.message || 'Processing failed' },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/process:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

