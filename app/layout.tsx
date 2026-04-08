import type { Metadata } from 'next'
import './globals.css'
import { StockProvider } from '@/components/StockProvider'
import { TooltipProvider } from '@/components/ui/tooltip'

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
      <body className="antialiased">
        <TooltipProvider delay={200}>
          <StockProvider>{children}</StockProvider>
        </TooltipProvider>
      </body>
    </html>
  )
}
