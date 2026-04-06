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

  const newsItems = newsResult.status === 'fulfilled' ? newsResult.value : []

  // 뉴스를 날짜 포함해서 프롬프트에 전달
  const newsText =
    newsItems.length > 0
      ? newsItems
          .map((n) => {
            const date = new Date(n.datetime * 1000).toLocaleDateString('ko-KR', {
              timeZone: 'Asia/Seoul',
              month: 'short',
              day: 'numeric',
            })
            return `- [${date}] ${n.headline}`
          })
          .join('\n')
      : '뉴스 없음'

  let score = 50
  let reasoning = '분석 일시 불가'

  try {
    const client = new Anthropic()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const message = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: `다음 주식 데이터를 분석하고 JSON으로만 응답하세요 (다른 텍스트 없이):
- 종목: ${ticker} (${COMPANIES[ticker] ?? ticker})
- 현재 RSI(14): ${rsi.toFixed(1)}
- 최근 뉴스 (최신순):
${newsText}

점수 기준 (기본 50점에서 합산):
- RSI < 30: +25점 (강한 과매도)
- RSI 30-45: +10점 (약한 과매도)
- RSI 55-70: -10점 (약한 과매수)
- RSI > 70: -25점 (강한 과매수)
- 긍정 뉴스 1건당: +15점
- 부정 뉴스 1건당: -15점

응답 형식:
{"score": 0-100, "reasoning": "RSI {값}로 {상태}. 뉴스: {핵심 뉴스 1-2건 한줄 요약}. 전망: {단기 방향성 및 투자 판단 한 줄}."}

reasoning은 반드시 한국어로, 뉴스 요약과 단기 전망을 모두 포함하세요.`,
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
    isStale: false,
  }
}

// 5분 캐시 (Finnhub 실시간 반영)
export const analyzeStock = unstable_cache(_analyzeStock, ['stock-analysis'], {
  revalidate: 300,
})
