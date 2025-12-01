import { NextResponse, type NextRequest } from 'next/server'

// Mobile detection using User-Agent
function isMobileDevice(userAgent: string | null): boolean {
  if (!userAgent) return false
  
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i
  return mobileRegex.test(userAgent)
}

// Routes that should NOT be redirected (API routes, static files, etc.)
const excludedPaths = [
  '/api/',
  '/_next/',
  '/favicon',
  '/manifest.json',
  '/pdf.worker',
]

// Desktop routes that have mobile equivalents
const desktopToMobileRoutes: Record<string, string> = {
  '/': '/m/welcome',
  '/login': '/m/login',
  '/register': '/m/register',
  '/dashboard': '/m',
  '/lessons': '/m/lessons',
  '/lessons/new': '/m/lessons/new',
  '/mcq': '/m/mcq',
  '/mcq/new': '/m/mcq/new',
}

// Mobile routes that have desktop equivalents
const mobileToDesktopRoutes: Record<string, string> = {
  '/m': '/dashboard',
  '/m/welcome': '/',
  '/m/login': '/login',
  '/m/register': '/register',
  '/m/lessons': '/lessons',
  '/m/lessons/new': '/lessons/new',
  '/m/mcq': '/mcq',
  '/m/mcq/new': '/mcq/new',
  '/m/profile': '/dashboard',
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const userAgent = req.headers.get('user-agent')
  const isMobile = isMobileDevice(userAgent)
  
  // Skip excluded paths
  if (excludedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Handle dynamic routes
  const lessonMatch = pathname.match(/^\/lessons\/([^\/]+)$/)
  const mcqMatch = pathname.match(/^\/mcq\/([^\/]+)$/)
  const mcqEditMatch = pathname.match(/^\/mcq\/([^\/]+)\/edit$/)
  
  const mobileLessonMatch = pathname.match(/^\/m\/lessons\/([^\/]+)$/)
  const mobileMcqMatch = pathname.match(/^\/m\/mcq\/([^\/]+)$/)
  const mobileMcqEditMatch = pathname.match(/^\/m\/mcq\/([^\/]+)\/edit$/)

  // Mobile device accessing desktop routes -> redirect to mobile
  if (isMobile && !pathname.startsWith('/m')) {
    let mobileUrl: string | null = null
    
    // Check static routes
    if (desktopToMobileRoutes[pathname]) {
      mobileUrl = desktopToMobileRoutes[pathname]
    }
    // Check dynamic lesson route
    else if (lessonMatch) {
      mobileUrl = `/m/lessons/${lessonMatch[1]}`
    }
    // Check dynamic MCQ routes
    else if (mcqEditMatch) {
      mobileUrl = `/m/mcq/${mcqEditMatch[1]}/edit`
    }
    else if (mcqMatch) {
      mobileUrl = `/m/mcq/${mcqMatch[1]}`
    }
    
    if (mobileUrl) {
      const url = req.nextUrl.clone()
      url.pathname = mobileUrl
      return NextResponse.redirect(url)
    }
  }
  
  // Desktop device accessing mobile routes -> redirect to desktop
  if (!isMobile && pathname.startsWith('/m')) {
    let desktopUrl: string | null = null
    
    // Check static routes
    if (mobileToDesktopRoutes[pathname]) {
      desktopUrl = mobileToDesktopRoutes[pathname]
    }
    // Check dynamic lesson route
    else if (mobileLessonMatch) {
      desktopUrl = `/lessons/${mobileLessonMatch[1]}`
    }
    // Check dynamic MCQ routes  
    else if (mobileMcqEditMatch) {
      desktopUrl = `/mcq/${mobileMcqEditMatch[1]}/edit`
    }
    else if (mobileMcqMatch) {
      desktopUrl = `/mcq/${mobileMcqMatch[1]}`
    }
    
    if (desktopUrl) {
      const url = req.nextUrl.clone()
      url.pathname = desktopUrl
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}
