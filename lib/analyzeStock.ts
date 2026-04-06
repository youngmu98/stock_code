import Anthropic from '@anthropic-ai/sdk'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { RSI } from 'technicalindicators'
import { getStockQuote } from './polygon'
import { getStockNews } from './news'
import { determineSignal } from './determineSignal'
import { COMPANIES } from './constants'
import type { StockAnalysis, NewsItem } from './types'

const ClaudeResponseSchema = z.object({
  score: z.number().min(0).max(100),
  reasoning: z.string(),
  newsSummaries: z.array(z.string()).optional(),
})

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
            const date = new Date(n.datetime * 1000).toLocaleDateString(
              'ko-KR',
              { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' },
            )
            return `${i + 1}. [${date}] ${n.headline}`
          })
          .join('\n')
      : '뉴스 없음'

  let score = 50
  let reasoning = 'AI 분석 불가 (API 키 미설정)'
  let newsItems: NewsItem[] = rawNewsItems

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic()
      const controller = new AbortController()
      // Vercel 무료 플랜 10초 제한 고려 → 7초 타임아웃
      const timeout = setTimeout(() => controller.abort(), 7000)

      const message = await client.messages.create(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [
            {
              role: 'user',
              content: `다음 주식 데이터를 분석하고 JSON으로만 응답하세요 (마크다운 없이 순수 JSON):

- 종목: ${ticker} (${COMPANIES[ticker] ?? ticker})
- RSI(14): ${rsi.toFixed(1)}
- 최근 뉴스:
${newsText}

점수 기준 (기본 50점):
- RSI < 30: +25 / RSI 30-45: +10 / RSI 55-70: -10 / RSI > 70: -25
- 긍정 뉴스 1건당: +15 / 부정 뉴스 1건당: -15

{"score":0~100,"reasoning":"RSI {값} {상태}. 뉴스: {핵심 1~2건 한국어 요약}. 전망: {단기 투자 판단 한 줄}.","newsSummaries":["뉴스1 한국어 요약 (25자 이내)","뉴스2 요약",...]}

모든 텍스트 한국어로.`,
            },
          ],
        },
        { signal: controller.signal as AbortSignal },
      )

      clearTimeout(timeout)

      const text =
        message.content[0].type === 'text' ? message.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        const parsed = ClaudeResponseSchema.safeParse(
          JSON.parse(jsonMatch[0]),
        )
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
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      reasoning = `AI 분석 오류: ${msg.slice(0, 200)}`
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
export const analyzeStock = unstable_cache(_analyzeStock, ['stock-analysis-v2'], {
  revalidate: 300,
})
