import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '주식 시그널 대시보드',
  description: 'AI + RSI 기반 매수/매도 시그널 대시보드',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  )
}
