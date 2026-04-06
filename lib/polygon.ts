// 현재가: Finnhub quote (15분 지연 실시간)
// RSI 히스토리: Polygon aggs (무료 플랜 일봉 지원)

export interface StockQuote {
  currentPrice: number
  changePercent: number
  closes: number[] // RSI(14) 계산용 30개 이상 종가
}

export async function getStockQuote(ticker: string): Promise<StockQuote> {
  const finnhubKey = process.env.FINNHUB_API_KEY
  const polygonKey = process.env.POLYGON_API_KEY

  if (!finnhubKey) throw new Error('FINNHUB_API_KEY 없음')

  // 1. 실시간 현재가 (Finnhub quote)
  const quoteRes = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubKey}`,
    { next: { revalidate: 300 } },
  )
  if (quoteRes.status === 429) throw new Error('FINNHUB_RATE_LIMIT')
  if (!quoteRes.ok) throw new Error(`Finnhub quote ${quoteRes.status}`)

  const quote = await quoteRes.json()
  if (!quote.c || quote.c === 0) throw new Error('가격 데이터 없음')

  const currentPrice: number = quote.c
  const prevClose: number = quote.pc ?? quote.c
  const changePercent: number =
    quote.dp ?? ((currentPrice - prevClose) / prevClose) * 100

  // 2. RSI 계산용 일봉 히스토리 (Polygon — 무료 플랜 EOD 지원)
  let closes: number[] = []

  if (polygonKey) {
    try {
      const to = new Date().toISOString().split('T')[0]
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() - 60)
      const from = fromDate.toISOString().split('T')[0]

      const polygonRes = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}` +
          `?adjusted=true&limit=40&sort=asc&apiKey=${polygonKey}`,
        { next: { revalidate: 3600 } },
      )

      if (polygonRes.ok) {
        const data = await polygonRes.json()
        const bars: Array<{ c: number }> = data.results ?? []
        if (bars.length >= 15) {
          closes = bars.map((b) => b.c)
        }
      }
    } catch {
      // Polygon 실패 시 아래 폴백
    }
  }

  // Polygon 데이터 없으면 최소 배열 (RSI는 50 기본값 사용됨)
  if (closes.length < 2) {
    closes = [prevClose, currentPrice]
  }

  return { currentPrice, changePercent, closes }
}
