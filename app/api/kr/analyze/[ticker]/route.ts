import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { RSI } from 'technicalindicators'
import { KR_TICKERS, KR_COMPANIES, getMarket, type KrTicker } from '@/lib/kr-constants'
import { getKrQuote, getKrDailyOhlcv } from '@/lib/kis'
import { determineSignal } from '@/lib/determineSignal'
import type { StockAnalysis } from '@/lib/types'

const GroqSchema = z.object({
  score: z.number().min(0).max(100),
  reasoning: z.string(),
})

function calcMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period
}

function calcVolumeRatio(volumes: number[]): number | null {
  if (volumes.length < 2) return null
  const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length - 1)
  return avg > 0 ? volumes[volumes.length - 1] / avg : null
}

function baseTechnicalScore(
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
  }
  return Math.max(5, Math.min(95, Math.round(score)))
}

async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY 없음')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq ${res.status}: ${err.slice(0, 100)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

const analyzeKrStock = unstable_cache(
  async (ticker: string): Promise<StockAnalysis> => {
    const market = getMarket(ticker)
    const companyName = KR_COMPANIES[ticker] ?? ticker

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
    const baseScore = baseTechnicalScore(rsi, quote.currentPrice, ma20, ma50)

    const maTrend =
      ma20 !== null && ma50 !== null
        ? ma20 > ma50
          ? `MA20(${ma20.toFixed(0)}원) > MA50(${ma50.toFixed(0)}원) → 골든크로스 구조`
          : `MA20(${ma20.toFixed(0)}원) < MA50(${ma50.toFixed(0)}원) → 데드크로스 구조`
        : 'MA 데이터 부족'

    const priceVsMa =
      ma50 !== null
        ? quote.currentPrice > ma50
          ? `현재가 MA50 위 (+${((quote.currentPrice / ma50 - 1) * 100).toFixed(1)}%)`
          : `현재가 MA50 아래 (${((quote.currentPrice / ma50 - 1) * 100).toFixed(1)}%)`
        : ''

    let score = baseScore
    let reasoning = 'AI 분석 불가 (GROQ_API_KEY 미설정)'

    if (process.env.GROQ_API_KEY) {
      try {
        const prompt = `한국 주식 데이터를 분석하고 JSON으로만 응답하세요 (마크다운 없이 순수 JSON):

종목: ${ticker} (${companyName})
현재가: ${quote.currentPrice.toLocaleString()}원 (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%)
RSI(14): ${rsi.toFixed(1)}
이동평균: ${maTrend}
${priceVsMa}
${volumeRatio !== null ? `거래량: 평균 대비 ${volumeRatio.toFixed(1)}배` : ''}

점수 기준 (기술 지표 기본값: ${baseScore}점):
- RSI < 30: +20 / RSI 30-45: +8 / RSI 55-70: -8 / RSI > 70: -20
- MA 골든크로스 + MA50 위: +15 / 데드크로스 + MA50 아래: -15

{"score":0~100,"reasoning":"RSI·MA를 종합한 80자 이내 한국어 분석. 구체적 수치 포함. 단기 전망으로 마무리."}

reasoning은 반드시 한국어, 80자 이내.`

        const text = await callGroq(prompt)
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const cleaned = jsonMatch[0]
            .replace(/,(\s*[}\]])/g, '$1')
            .replace(/[\x00-\x1F\x7F]/g, (c) =>
              c === '\n' ? '\\n' : c === '\t' ? '\\t' : '',
            )
          const parsed = GroqSchema.safeParse(JSON.parse(cleaned))
          if (parsed.success) {
            score = parsed.data.score
            reasoning = parsed.data.reasoning
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('429')) throw new Error('GROQ_RATE_LIMIT')
        score = baseScore
        reasoning = `AI 분석 일시 불가 (RSI ${rsi.toFixed(0)}, ${maTrend})`
      }
    }

    return {
      ticker,
      companyName,
      currentPrice: quote.currentPrice,
      changePercent: quote.changePercent,
      rsi,
      ma20,
      ma50,
      volumeRatio,
      signal: determineSignal(score),
      score,
      reasoning,
      newsItems: [],  // 한국 뉴스는 추후 추가
      lastUpdated: new Date().toISOString(),
      isStale: false,
      market: 'KR',
      currency: 'KRW',
    }
  },
  ['kr-analysis-v1'],
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

  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    return NextResponse.json({ error: 'KIS_APP_KEY / KIS_APP_SECRET 미설정' }, { status: 503 })
  }

  try {
    const data = await analyzeKrStock(ticker as KrTicker)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'GROQ_RATE_LIMIT') {
      return NextResponse.json({ error: 'rate_limit' }, { status: 429 })
    }
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
