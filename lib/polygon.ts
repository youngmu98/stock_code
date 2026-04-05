// Polygon.io 무료 티어: 미국 주식, 5 req/min, daily 히스토리

export interface StockQuote {
  currentPrice: number
  changePercent: number
  closes: number[] // RSI 계산용 최근 30개 종가
}

export async function getStockQuote(ticker: string): Promise<StockQuote> {
  const apiKey = process.env.POLYGON_API_KEY
  if (!apiKey) throw new Error('POLYGON_API_KEY 없음')

  // RSI(14) 계산에 충분한 30일치 데이터
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 60) // 60일 조회 → 약 40 거래일

  const fromStr = from.toISOString().split('T')[0]
  const toStr = to.toISOString().split('T')[0]

  const url =
    `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${fromStr}/${toStr}` +
    `?adjusted=true&limit=30&sort=asc&apiKey=${apiKey}`

  const res = await fetch(url, { next: { revalidate: 3600 } })

  if (res.status === 429) throw new Error('POLYGON_RATE_LIMIT')
  if (!res.ok) throw new Error(`Polygon ${res.status}`)

  const data = await res.json()
  const bars: Array<{ c: number; t: number }> = data.results ?? []

  if (bars.length < 2) throw new Error('데이터 부족')

  const closes = bars.map((b) => b.c)
  const latest = bars[bars.length - 1].c
  const prev = bars[bars.length - 2].c
  const changePercent = ((latest - prev) / prev) * 100

  return { currentPrice: latest, changePercent, closes }
}
