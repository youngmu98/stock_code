import Anthropic from '@anthropic-ai/sdk'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { RSI } from 'technicalindicators'
import { getStockQuote } from './polygon'
import { getStockNews } from './news'
import { determineSignal } from './determineSignal'
import { COMPANIES } from './constants'
import type { StockAnalysis } from './types'

const ClaudeResponseSchema = z.object({
  score: z.number().min(0).max(100),
  reasoning: z.string(),
})

async function _analyzeStock(ticker: string): Promise<StockAnalysis> {
  // 주가 + 뉴스 병렬 fetch, 부분 실패 허용
  const [quoteResult, newsResult] = await Promise.allSettled([
    getStockQuote(ticker),
    getStockNews(ticker),
  ])

  let currentPrice = 0
  let changePercent = 0
  let rsi = 50
  let isStale = false

  if (quoteResult.status === 'fulfilled') {
    const quote = quoteResult.value
    currentPrice = quote.currentPrice
    changePercent = quote.changePercent

    const rsiValues = RSI.calculate({ values: quote.closes, period: 14 })
    rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50
  } else {
    // 가격 데이터 실패(rate limit 포함) → throw해서 캐시에 저장되지 않게 함
    // page.tsx에서 mock 데이터로 폴백 처리
    throw new Error(quoteResult.reason?.message ?? 'PRICE_FETCH_FAILED')
  }

  const newsItems = newsResult.status === 'fulfilled' ? newsResult.value : []
  const newsText =
    newsItems.length > 0
      ? newsItems.map((n) => `- ${n.headline}`).join('\n')
      : '뉴스 없음'

  // Claude API 분석 (10초 타임아웃)
  let score = 50
  let reasoning = '분석 일시 불가'

  try {
    const client = new Anthropic()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const message = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: `다음 주식 데이터를 분석하고 JSON으로만 응답하세요 (다른 텍스트 없이):
- 종목: ${ticker} (${COMPANIES[ticker] ?? ticker})
- 현재 RSI(14): ${rsi.toFixed(1)}
- 최근 뉴스 (최대 3건, 각 100자 이내):
${newsText}

점수 기준 (기본 50점에서 합산):
- RSI < 30: +25점 (강한 과매도)
- RSI 30-45: +10점 (약한 과매도)
- RSI 55-70: -10점 (약한 과매수)
- RSI > 70: -25점 (강한 과매수)
- 긍정 뉴스 1건당: +15점
- 부정 뉴스 1건당: -15점

응답 형식:
{"score": 0-100, "reasoning": "RSI {값}로 {상태}. {뉴스 핵심 1-2줄}. {결론 한 줄}."}`,
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
      const parsed = ClaudeResponseSchema.safeParse(JSON.parse(jsonMatch[0]))
      if (parsed.success) {
        score = parsed.data.score
        reasoning = parsed.data.reasoning
      }
    }
  } catch {
    // 타임아웃 또는 API 실패 → 기본값 유지
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
    isStale,
  }
}

// unstable_cache: keyParts + 함수 인수(ticker)가 자동으로 캐시 키에 포함됨
// 즉 AAPL과 NVDA는 별도 캐시 엔트리를 가짐
export const analyzeStock = unstable_cache(_analyzeStock, ['stock-analysis'], {
  revalidate: 3600,
})
