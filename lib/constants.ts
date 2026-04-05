export const TICKERS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL'] as const
export type Ticker = (typeof TICKERS)[number]

export const COMPANIES: Record<string, string> = {
  AAPL: 'Apple Inc.',
  NVDA: 'NVIDIA Corp.',
  TSLA: 'Tesla Inc.',
  MSFT: 'Microsoft Corp.',
  GOOGL: 'Alphabet Inc.',
}
