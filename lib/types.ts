export type Signal = 'BUY' | 'SELL' | 'HOLD'

export interface NewsItem {
  headline: string
  summary?: string
  datetime: number
  url: string
}

export interface StockAnalysis {
  ticker: string
  companyName: string
  currentPrice: number
  changePercent: number
  rsi: number
  signal: Signal
  score: number
  reasoning: string
  newsItems: NewsItem[]
  lastUpdated: string // ISO string
  isStale: boolean // Polygon 429 hit
}

export interface ReplayEntry {
  ticker: string
  signal: Signal
  score: number
  price: number
  timestamp: string // ISO string
}
