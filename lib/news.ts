// Finnhub 무료 티어: 60 req/min, 프로덕션 제한 없음
// NewsAPI 무료는 localhost 전용이라 Finnhub으로 대체
import type { NewsItem } from './types'

export async function getStockNews(ticker: string): Promise<NewsItem[]> {
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return [] // API 키 없으면 뉴스 없이 RSI만으로 분석

  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 7)

  const fromStr = from.toISOString().split('T')[0]
  const toStr = to.toISOString().split('T')[0]

  try {
    const url =
      `https://finnhub.io/api/v1/company-news?symbol=${ticker}` +
      `&from=${fromStr}&to=${toStr}&token=${apiKey}`

    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []

    const news = await res.json()
    if (!Array.isArray(news)) return []

    return news.slice(0, 3).map((n: { headline: string; datetime: number; url: string }) => ({
      headline: n.headline.slice(0, 100),
      datetime: n.datetime,
      url: n.url,
    }))
  } catch {
    return []
  }
}
