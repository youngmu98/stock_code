import { NextResponse } from 'next/server'
import { analyzeStock } from '@/lib/analyzeStock'
import { MOCK_STOCKS } from '@/lib/mock-data'
import { TICKERS, type Ticker } from '@/lib/constants'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params
  const symbol = ticker.toUpperCase()

  if (!(TICKERS as readonly string[]).includes(symbol)) {
    return NextResponse.json({ error: 'Unknown ticker' }, { status: 404 })
  }

  try {
    const data = await analyzeStock(symbol as Ticker)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch {
    const mock = MOCK_STOCKS.find((s) => s.ticker === symbol) ?? MOCK_STOCKS[0]
    return NextResponse.json(mock)
  }
}
