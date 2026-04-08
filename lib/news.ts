// Finnhub 무료 티어: 60 req/min, 최신 뉴스 5건
import type { NewsItem } from './types'

export async function getStockNews(ticker: string): Promise<NewsItem[]> {
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return []

  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 7)

  const fromStr = from.toISOString().split('T')[0]
  const toStr = to.toISOString().split('T')[0]

  try {
    const url =
      `https://finnhub.io/api/v1/company-news?symbol=${ticker}` +
      `&from=${fromStr}&to=${toStr}&token=${apiKey}`

    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return []

    const news = await res.json()
    if (!Array.isArray(news)) return []

    // datetime 내림차순 정렬 → 최신 10건
    return news
      .sort(
        (a: { datetime: number }, b: { datetime: number }) =>
          b.datetime - a.datetime,
      )
      .slice(0, 10)
      .map((n: { headline: string; summary?: string; datetime: number; url: string }) => ({
        headline: n.headline,
        summary: n.summary ? n.summary.slice(0, 200) : undefined,
        datetime: n.datetime,
        url: n.url,
      }))
  } catch {
    return []
  }
}
