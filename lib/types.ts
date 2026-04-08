export type Signal = 'BUY' | 'SELL' | 'HOLD'

export interface NewsItem {
  headline: string
  summary?: string
  koreanSummary?: string // Claude가 생성한 한글 요약
  datetime: number
  url: string
}

export interface StockAnalysis {
  ticker: string
  companyName: string
  currentPrice: number
  changePercent: number
  rsi: number
  ma20: number | null
  ma50: number | null
  volumeRatio: number | null  // 현재 거래량 / 20일 평균 거래량
  signal: Signal
  score: number
  reasoning: string
  newsItems: NewsItem[]
  lastUpdated: string // ISO string
  isStale: boolean
}

export interface ReplayEntry {
  ticker: string
  signal: Signal
  score: number
  price: number
  timestamp: string // ISO string
}
