import { NextResponse } from 'next/server'
import { TICKERS, type Ticker, COMPANIES } from '@/lib/constants'
import { getStockQuote } from '@/lib/polygon'
import { getStockNews } from '@/lib/news'
import { determineSignal } from '@/lib/determineSignal'
import { unstable_cache } from 'next/cache'
import { RSI } from 'technicalindicators'
import type { StockAnalysis } from '@/lib/types'

function calcMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function calcVolumeRatio(volumes: number[]): number | null {
  if (volumes.length < 2) return null
  const avg20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length - 1)
  const latest = volumes[volumes.length - 1]
  return avg20 > 0 ? latest / avg20 : null
}

// RSI + MA 복합 점수 (Groq 없이)
function technicalScore(
  rsi: number,
  price: number,
  ma20: number | null,
  ma50: number | null,
): number {
  let score = 50

  // RSI 구간 기여 (-20 ~ +20)
  if (rsi < 30) score += 20
  else if (rsi < 45) score += 8
  else if (rsi > 70) score -= 20
  else if (rsi > 55) score -= 8

  // MA 추세 기여 (-15 ~ +15)
  if (ma20 !== null && ma50 !== null) {
    if (ma20 > ma50) score += 8   // 골든크로스 구조
    else score -= 8               // 데드크로스 구조

    if (price > ma50) score += 7  // 장기 추세선 위
    else score -= 7
  } else if (ma20 !== null) {
    if (price > ma20) score += 5
    else score -= 5
  }

  return Math.max(5, Math.min(95, Math.round(score)))
}

const getPriceData = unstable_cache(
  async (ticker: string): Promise<StockAnalysis> => {
    const [quoteResult, newsResult] = await Promise.allSettled([
      getStockQuote(ticker),
      getStockNews(ticker),
    ])

    if (quoteResult.status === 'rejected') {
      throw new Error(quoteResult.reason?.message ?? 'PRICE_FETCH_FAILED')
    }

    const quote = quoteResult.value
    const rsiValues = RSI.calculate({ values: quote.closes, period: 14 })
    const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50
    const ma20 = calcMA(quote.closes, 20)
    const ma50 = calcMA(quote.closes, 50)
    const volumeRatio = calcVolumeRatio(quote.volumes)
    const score = technicalScore(rsi, quote.currentPrice, ma20, ma50)
    const newsItems = newsResult.status === 'fulfilled' ? newsResult.value : []

    return {
      ticker,
      companyName: COMPANIES[ticker] ?? ticker,
      currentPrice: quote.currentPrice,
      changePercent: quote.changePercent,
      rsi,
      ma20,
      ma50,
      volumeRatio,
      signal: determineSignal(score),
      score,
      reasoning: '',
      newsItems,
      lastUpdated: new Date().toISOString(),
      isStale: false,
    }
  },
  ['price-data-v2'],
  { revalidate: 300 },
)

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params
  const symbol = ticker.toUpperCase()

  if (!(TICKERS as readonly string[]).includes(symbol)) {
    return NextResponse.json({ error: 'Unknown ticker' }, { status: 404 })
  }

  try {
    const data = await getPriceData(symbol as Ticker)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    })
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
