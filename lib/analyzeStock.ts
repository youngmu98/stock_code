import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { RSI } from 'technicalindicators'
import { getStockQuote } from './polygon'
import { getStockNews } from './news'
import { determineSignal } from './determineSignal'
import { COMPANIES } from './constants'
import type { StockAnalysis, NewsItem } from './types'

const GeminiResponseSchema = z.object({
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
      max_tokens: 700,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq ${res.status}: ${err.slice(0, 100)}`)
  }

  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

async function _analyzeStock(ticker: string): Promise<StockAnalysis> {
  const [quoteResult, newsResult] = await Promise.allSettled([
    getStockQuote(ticker),
    getStockNews(ticker),
  ])

  let currentPrice = 0
  let changePercent = 0
  let rsi = 50

  if (quoteResult.status === 'fulfilled') {
    const quote = quoteResult.value
    currentPrice = quote.currentPrice
    changePercent = quote.changePercent

    const rsiValues = RSI.calculate({ values: quote.closes, period: 14 })
    rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50
  } else {
    throw new Error(quoteResult.reason?.message ?? 'PRICE_FETCH_FAILED')
  }

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

  let score = 50
  let reasoning = 'AI 분석 불가 (GROQ_API_KEY 미설정)'
  let newsItems: NewsItem[] = rawNewsItems

  if (process.env.GROQ_API_KEY) {
    try {
      const prompt = `다음 주식 데이터를 분석하고 JSON으로만 응답하세요 (마크다운 없이 순수 JSON):

- 종목: ${ticker} (${COMPANIES[ticker] ?? ticker})
- RSI(14): ${rsi.toFixed(1)}
- 최근 뉴스:
${newsText}

점수 기준 (기본 50점):
- RSI < 30: +25 / RSI 30-45: +10 / RSI 55-70: -10 / RSI > 70: -25
- 긍정 뉴스 1건당: +15 / 부정 뉴스 1건당: -15

{"score":0~100,"reasoning":"RSI {값}으로 {과매수/과매도/중립} 상태. {최근 뉴스 핵심 2건 요약, 각 20자 이내}. {뉴스가 주가에 미치는 영향 1문장}. 단기 전망: {매수/매도/관망 근거와 방향성 1문장}. 총 100자 내외.","newsSummaries":["뉴스1 한국어 요약 25자 이내","뉴스2 요약",...]}

reasoning은 반드시 100자 내외 한국어. 모든 텍스트 반드시 한국어.`

      const text = await callGroq(prompt)
      const jsonMatch = text.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        // Llama가 생성하는 trailing comma, 줄바꿈 등 정제
        const cleaned = jsonMatch[0]
          .replace(/,(\s*[}\]])/g, '$1') // trailing comma 제거
          .replace(/[\x00-\x1F\x7F]/g, (c) => // 제어문자 이스케이프
            c === '\n' ? '\\n' : c === '\t' ? '\\t' : '',
          )

        try {
          const parsed = GeminiResponseSchema.safeParse(JSON.parse(cleaned))
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
          // JSON 파싱 실패 시 score/reasoning만 정규식으로 추출
          const scoreMatch = text.match(/"score"\s*:\s*(\d+)/)
          const reasonMatch = text.match(/"reasoning"\s*:\s*"([^"]+)"/)
          if (scoreMatch) score = Math.min(100, Math.max(0, parseInt(scoreMatch[1])))
          if (reasonMatch) reasoning = reasonMatch[1]
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 429는 캐시하면 안 됨 → throw해서 API 라우트에서 재시도 유도
      if (msg.includes('429')) throw new Error('GROQ_RATE_LIMIT')
      reasoning = `AI 분석 일시 불가`
    }
  }

  return {
    ticker,
    companyName: COMPANIES[ticker] ?? ticker,
    currentPrice,
    changePercent,
    rsi,
    signal: determineSignal(score),
    score,
    reasoning,
    newsItems,
    lastUpdated: new Date().toISOString(),
    isStale: false,
  }
}

// 5분 캐시 (ticker별 독립 캐시 키)
export const analyzeStock = unstable_cache(_analyzeStock, ['stock-analysis-v11'], {
  revalidate: 300,
})
