import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { RSI } from 'technicalindicators'
import { getStockQuote } from './polygon'
import { getStockNews } from './news'
import { determineSignal } from './determineSignal'
import { COMPANIES } from './constants'
import type { StockAnalysis, NewsItem } from './types'

const GroqResponseSchema = z.object({
  score: z.number().min(0).max(100),
  reasoning: z.string(),
  newsSummaries: z.array(z.string()).optional(),
})

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
      max_tokens: 800,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq ${res.status}: ${err.slice(0, 100)}`)
  }

  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

function calcMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period
}

function calcVolumeRatio(volumes: number[]): number | null {
  if (volumes.length < 2) return null
  const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length - 1)
  return avg > 0 ? volumes[volumes.length - 1] / avg : null
}

// RSI + MA 기반 기본 점수 (Groq 점수 출발점)
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

async function _analyzeStock(ticker: string): Promise<StockAnalysis> {
  const [quoteResult, newsResult] = await Promise.allSettled([
    getStockQuote(ticker),
    getStockNews(ticker),
  ])

  if (quoteResult.status === 'rejected') {
    throw new Error(quoteResult.reason?.message ?? 'PRICE_FETCH_FAILED')
  }

  const quote = quoteResult.value
  const { currentPrice, changePercent, closes, volumes } = quote

  const rsiValues = RSI.calculate({ values: closes, period: 14 })
  const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50
  const ma20 = calcMA(closes, 20)
  const ma50 = calcMA(closes, 50)
  const volumeRatio = calcVolumeRatio(volumes)

  const rawNewsItems = newsResult.status === 'fulfilled' ? newsResult.value : []

  const newsText =
    rawNewsItems.length > 0
      ? rawNewsItems
          .map((n, i) => {
            const date = new Date(n.datetime * 1000).toLocaleDateString('ko-KR', {
              timeZone: 'Asia/Seoul',
              month: 'short',
              day: 'numeric',
            })
            return `${i + 1}. [${date}] ${n.headline}`
          })
          .join('\n')
      : '뉴스 없음'

  // 기술 지표 컨텍스트 문자열 (Groq에게 전달)
  const maTrend =
    ma20 !== null && ma50 !== null
      ? ma20 > ma50
        ? `MA20(${ma20.toFixed(1)}) > MA50(${ma50.toFixed(1)}) → 단기 골든크로스 구조`
        : `MA20(${ma20.toFixed(1)}) < MA50(${ma50.toFixed(1)}) → 단기 데드크로스 구조`
      : 'MA 데이터 부족'

  const priceVsMa =
    ma50 !== null
      ? currentPrice > ma50
        ? `현재가 MA50 위 (+${((currentPrice / ma50 - 1) * 100).toFixed(1)}%)`
        : `현재가 MA50 아래 (${((currentPrice / ma50 - 1) * 100).toFixed(1)}%)`
      : ''

  const volumeCtx =
    volumeRatio !== null
      ? volumeRatio >= 1.5
        ? `거래량 평균 대비 ${volumeRatio.toFixed(1)}배 (급증)`
        : volumeRatio <= 0.5
          ? `거래량 평균 대비 ${volumeRatio.toFixed(1)}배 (감소)`
          : `거래량 평균 수준 (${volumeRatio.toFixed(1)}배)`
      : ''

  const baseScore = baseTechnicalScore(rsi, currentPrice, ma20, ma50)

  let score = baseScore
  let reasoning = 'AI 분석 불가 (GROQ_API_KEY 미설정)'
  let newsItems: NewsItem[] = rawNewsItems

  if (process.env.GROQ_API_KEY) {
    try {
      const prompt = `다음 주식 데이터를 분석하고 JSON으로만 응답하세요 (마크다운 없이 순수 JSON):

종목: ${ticker} (${COMPANIES[ticker] ?? ticker})
현재가: $${currentPrice.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)
RSI(14): ${rsi.toFixed(1)}
이동평균: ${maTrend}
${priceVsMa}
${volumeCtx ? '거래량: ' + volumeCtx : ''}
최근 뉴스:
${newsText}

점수 산정 기준 (기술 지표 기본값: ${baseScore}점):
- RSI < 30: +20 / RSI 30-45: +8 / RSI 55-70: -8 / RSI > 70: -20
- MA 골든크로스 + MA50 위: +15 / 데드크로스 + MA50 아래: -15
- 긍정 뉴스 1건당: +10 / 부정 뉴스 1건당: -10
- 거래량 급증 시 신호 강도 ×1.2 (최대 ±5 추가)

{"score":0~100,"reasoning":"RSI·MA·뉴스를 종합한 80자 이내 한국어 분석. 구체적 수치 포함. 단기 전망으로 마무리.","newsSummaries":["뉴스1: 무슨 일이 있었는지 핵심 사실을 한국어로 50자 내외","뉴스2: 같은 방식으로",...]}

모든 텍스트 반드시 한국어. reasoning은 수치 기반으로 정확하게.`

      const text = await callGroq(prompt)
      const jsonMatch = text.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        const cleaned = jsonMatch[0]
          .replace(/,(\s*[}\]])/g, '$1')
          .replace(/[\x00-\x1F\x7F]/g, (c) =>
            c === '\n' ? '\\n' : c === '\t' ? '\\t' : '',
          )

        try {
          const parsed = GroqResponseSchema.safeParse(JSON.parse(cleaned))
          if (parsed.success) {
            score = parsed.data.score
            reasoning = parsed.data.reasoning
            if (parsed.data.newsSummaries) {
              newsItems = rawNewsItems.map((n, i) => ({
                ...n,
                koreanSummary: parsed.data.newsSummaries?.[i],
              }))
            }
          }
        } catch {
          const scoreMatch = text.match(/"score"\s*:\s*(\d+)/)
          const reasonMatch = text.match(/"reasoning"\s*:\s*"([^"]+)"/)
          if (scoreMatch) score = Math.min(100, Math.max(0, parseInt(scoreMatch[1])))
          if (reasonMatch) reasoning = reasonMatch[1]
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('429')) throw new Error('GROQ_RATE_LIMIT')
      score = baseScore // Groq 실패 시 기술 지표 점수 유지
      reasoning = `AI 분석 일시 불가 (기술 지표 기반 점수: RSI ${rsi.toFixed(0)}, ${maTrend})`
    }
  }

  return {
    ticker,
    companyName: COMPANIES[ticker] ?? ticker,
    currentPrice,
    changePercent,
    rsi,
    ma20,
    ma50,
    volumeRatio,
    signal: determineSignal(score),
    score,
    reasoning,
    newsItems,
    lastUpdated: new Date().toISOString(),
    isStale: false,
  }
}

export const analyzeStock = unstable_cache(_analyzeStock, ['stock-analysis-v13'], {
  revalidate: 300,
})
