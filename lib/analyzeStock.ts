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
  newsSummaries: z.array(z.string()).optional(), // 각 뉴스 한글 요약
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

  // 뉴스를 날짜 포함해서 프롬프트에 전달
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
  let reasoning = 'AI 분석을 위해 ANTHROPIC_API_KEY가 필요합니다.'
  let newsItems: NewsItem[] = rawNewsItems

  const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY

  if (hasClaudeKey) {
    try {
      const client = new Anthropic()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const message = await client.messages.create(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [
            {
              role: 'user',
              content: `다음 주식 데이터를 분석하고 JSON으로만 응답하세요 (마크다운 코드블록 없이 순수 JSON만):

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

응답 형식 (반드시 이 JSON 구조만):
{
  "score": 0~100 사이 숫자,
  "reasoning": "RSI {값}로 {상태}. 뉴스: {핵심 뉴스 1~2건 한국어 요약}. 전망: {단기 방향성 및 투자 판단 한 줄}.",
  "newsSummaries": ["뉴스1 한국어 요약 (30자 이내)", "뉴스2 한국어 요약", ...]
}

newsSummaries 배열은 뉴스 순서 그대로, 모든 텍스트는 한국어로.`,
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

          // 한글 요약을 각 뉴스에 붙임
          if (parsed.data.newsSummaries) {
            newsItems = rawNewsItems.map((n, i) => ({
              ...n,
              koreanSummary: parsed.data.newsSummaries?.[i],
            }))
          }
        }
      }
    } catch {
      // 타임아웃 또는 API 실패 → 기본값 유지
      reasoning = '분석 일시 불가 (API 오류)'
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

// 5분 캐시
export const analyzeStock = unstable_cache(_analyzeStock, ['stock-analysis'], {
  revalidate: 300,
})
