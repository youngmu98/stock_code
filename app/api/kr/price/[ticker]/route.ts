import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { RSI } from 'technicalindicators'
import { KR_TICKERS, KR_COMPANIES, getMarket, type KrTicker } from '@/lib/kr-constants'
import { getKrQuote, getKrDailyOhlcv } from '@/lib/kis'
import { determineSignal } from '@/lib/determineSignal'
import type { StockAnalysis } from '@/lib/types'

function calcMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period
}

function calcVolumeRatio(volumes: number[]): number | null {
  if (volumes.length < 2) return null
  const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length - 1)
  return avg > 0 ? volumes[volumes.length - 1] / avg : null
}

function technicalScore(
  rsi: number,
  price: number,
  ma20: number | null,
  ma50: number | null,
): number {
  let score = 50
  if (rsi < 30) score += 20
  else if (rsi < 45) score += 8
  else if (rsi > 70) score -= 20
  else if (rsi > 55) score -= 8
  if (ma20 !== null && ma50 !== null) {
    if (ma20 > ma50) score += 8
    else score -= 8
    if (price > ma50) score += 7
    else score -= 7
  } else if (ma20 !== null) {
    if (price > ma20) score += 5
    else score -= 5
  }
  return Math.max(5, Math.min(95, Math.round(score)))
}

const getKrPriceData = unstable_cache(
  async (ticker: string): Promise<StockAnalysis> => {
    const market = getMarket(ticker)

    const [quoteResult, ohlcvResult] = await Promise.allSettled([
      getKrQuote(ticker, market),
      getKrDailyOhlcv(ticker, market, 65),
    ])

    if (quoteResult.status === 'rejected') {
      throw new Error(quoteResult.reason?.message ?? 'KR_PRICE_FETCH_FAILED')
    }

    const quote = quoteResult.value
    const bars = ohlcvResult.status === 'fulfilled' ? ohlcvResult.value : []
    const closes = bars.map((b) => b.close)
    const volumes = bars.map((b) => b.volume)

    const rsiValues = RSI.calculate({ values: closes, period: 14 })
    const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50
    const ma20 = calcMA(closes, 20)
    const ma50 = calcMA(closes, 50)
    const volumeRatio = calcVolumeRatio(volumes)
    const score = technicalScore(rsi, quote.currentPrice, ma20, ma50)

    return {
      ticker,
      companyName: KR_COMPANIES[ticker] ?? ticker,
      currentPrice: quote.currentPrice,
      changePercent: quote.changePercent,
      rsi,
      ma20,
      ma50,
      volumeRatio,
      signal: determineSignal(score),
      score,
      reasoning: '',
      newsItems: [],
      lastUpdated: new Date().toISOString(),
      isStale: false,
      market: 'KR',
      currency: 'KRW',
    }
  },
  ['kr-price-data-v1'],
  { revalidate: 300 },
)

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params

  if (!(KR_TICKERS as readonly string[]).includes(ticker)) {
    return NextResponse.json({ error: 'Unknown ticker' }, { status: 404 })
  }

  // KIS 키 미설정 시 안내
  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    return NextResponse.json({ error: 'KIS_APP_KEY / KIS_APP_SECRET 미설정' }, { status: 503 })
  }

  try {
    const data = await getKrPriceData(ticker as KrTicker)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    })
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
