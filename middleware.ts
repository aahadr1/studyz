import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  // Simple middleware - just pass through
  // Auth checking is done client-side for simplicity
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
