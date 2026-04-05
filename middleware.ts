import { NextRequest, NextResponse } from 'next/server'

// 인메모리 rate limiter (추가 가입 없음, 무료)
// 서버리스 환경에서 인스턴스 간 공유 안 됨 — 개인 프로젝트 수준에서 충분
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 60 * 1000 // 1분
const MAX_REQUESTS = 30 // 분당 30회

export function middleware(request: NextRequest) {
  // API 라우트만 rate limit 적용
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return NextResponse.next()
  }

  entry.count++

  if (entry.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' },
      { status: 429 },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
