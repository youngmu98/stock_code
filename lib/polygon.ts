// Finnhub 무료 티어: 실시간 가격(15분 지연) + 일봉 히스토리
// Polygon 무료는 이전 거래일 종가만 제공 → Finnhub으로 교체

export interface StockQuote {
  currentPrice: number
  changePercent: number
  closes: number[] // RSI 계산용 최근 30개 종가
}

export async function getStockQuote(ticker: string): Promise<StockQuote> {
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) throw new Error('FINNHUB_API_KEY 없음')

  // 1. 실시간 가격 (15분 지연, 무료)
  const quoteUrl =
    `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`

  const quoteRes = await fetch(quoteUrl, { next: { revalidate: 300 } })
  if (quoteRes.status === 429) throw new Error('FINNHUB_RATE_LIMIT')
  if (!quoteRes.ok) throw new Error(`Finnhub quote ${quoteRes.status}`)

  const quote = await quoteRes.json()

  // c=0 이면 장외 시간이거나 데이터 없음
  if (!quote.c || quote.c === 0) throw new Error('가격 데이터 없음')

  const currentPrice: number = quote.c
  const prevClose: number = quote.pc ?? quote.c
  const changePercent: number =
    quote.dp ?? ((currentPrice - prevClose) / prevClose) * 100

  // 2. RSI(14) 계산용 일봉 히스토리
  const toTs = Math.floor(Date.now() / 1000)
  const fromTs = toTs - 60 * 24 * 60 * 60 // 60일 전

  const candleUrl =
    `https://finnhub.io/api/v1/stock/candle` +
    `?symbol=${ticker}&resolution=D&from=${fromTs}&to=${toTs}&token=${apiKey}`

  let closes: number[] = []
  try {
    const candleRes = await fetch(candleUrl, { next: { revalidate: 3600 } })
    if (candleRes.ok) {
      const candle = await candleRes.json()
      if (candle.s === 'ok' && Array.isArray(candle.c) && candle.c.length >= 2) {
        closes = candle.c
      }
    }
  } catch {
    // 히스토리 실패 → 현재가 기반 최소 배열 (RSI 계산은 의미 없지만 crash 방지)
  }

  if (closes.length < 2) {
    closes = [prevClose, currentPrice]
  }

  return { currentPrice, changePercent, closes }
}
