'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { KR_TICKERS } from '@/lib/kr-constants'
import type { StockAnalysis } from '@/lib/types'

const LS_KEY = 'kr-stock-cache-v1'
const STALE_MS = 5 * 60 * 1000
const STAGGER_MS = 2500

interface CacheEntry { data: StockAnalysis; fetchedAt: number }
type CacheStore = Partial<Record<string, CacheEntry>>

function loadLS(): CacheStore {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch { return {} }
}
function saveLS(store: CacheStore) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)) } catch {}
}

interface KrStockCtx {
  stocks: Map<string, StockAnalysis>
  analyzing: Set<string>
  refresh: (ticker?: string) => void
  hasApiKey: boolean   // KIS 키 설정 여부
}

const Ctx = createContext<KrStockCtx>({
  stocks: new Map(),
  analyzing: new Set(),
  refresh: () => {},
  hasApiKey: false,
})

export function useKrStocks() { return useContext(Ctx) }

export function KrStockProvider({ children }: { children: React.ReactNode }) {
  const [stocks, setStocks] = useState<Map<string, StockAnalysis>>(() => {
    const cache = loadLS()
    return new Map(
      Object.entries(cache).filter(([, v]) => v != null).map(([k, v]) => [k, v!.data]),
    )
  })
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set())
  const [hasApiKey, setHasApiKey] = useState(false)

  const cacheRef = useRef<CacheStore>(loadLS())
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const setStock = useCallback((data: StockAnalysis, fromAnalyze = false) => {
    setStocks((prev) => {
      const existing = prev.get(data.ticker)
      if (!fromAnalyze && existing?.reasoning) {
        return new Map(prev).set(data.ticker, {
          ...existing,
          currentPrice: data.currentPrice,
          changePercent: data.changePercent,
          rsi: data.rsi,
          ma20: data.ma20,
          ma50: data.ma50,
          volumeRatio: data.volumeRatio,
          score: data.score,
          signal: data.signal,
          lastUpdated: data.lastUpdated,
        })
      }
      return new Map(prev).set(data.ticker, data)
    })
    if (fromAnalyze) {
      cacheRef.current = { ...cacheRef.current, [data.ticker]: { data, fetchedAt: Date.now() } }
      saveLS(cacheRef.current)
    }
  }, [])

  const fetchPrice = useCallback(async (ticker: string) => {
    try {
      const res = await fetch(`/api/kr/price/${ticker}`, { cache: 'no-store' })
      if (res.status === 503) return  // KIS 키 없음 — 조용히 스킵
      if (res.ok) {
        const data: StockAnalysis = await res.json()
        if (data?.ticker) setStock(data, false)
      }
    } catch {}
  }, [setStock])

  const fetchAnalyze = useCallback(async (ticker: string) => {
    setAnalyzing((prev) => new Set(prev).add(ticker))
    try {
      const res = await fetch(`/api/kr/analyze/${ticker}`, { cache: 'no-store' })
      if (res.status === 503) return
      if (res.ok) {
        const data: StockAnalysis = await res.json()
        if (data?.ticker) setStock(data, true)
      }
    } catch {
    } finally {
      setAnalyzing((prev) => { const s = new Set(prev); s.delete(ticker); return s })
    }
  }, [setStock])

  const refreshAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    KR_TICKERS.forEach((t) => fetchPrice(t))
    KR_TICKERS.forEach((ticker, i) => {
      const id = setTimeout(() => fetchAnalyze(ticker), i * STAGGER_MS)
      timersRef.current.push(id)
    })
  }, [fetchPrice, fetchAnalyze])

  const refresh = useCallback((ticker?: string) => {
    if (ticker) { fetchPrice(ticker); fetchAnalyze(ticker) }
    else refreshAll()
  }, [fetchPrice, fetchAnalyze, refreshAll])

  const refreshAllRef = useRef(refreshAll)
  refreshAllRef.current = refreshAll

  useEffect(() => {
    // KIS 키 설정 여부 확인 (첫 요청으로 체크)
    fetch(`/api/kr/price/${KR_TICKERS[0]}`, { cache: 'no-store' })
      .then((r) => setHasApiKey(r.status !== 503))
      .catch(() => {})

    refreshAllRef.current()
    const interval = setInterval(() => refreshAllRef.current(), STALE_MS)
    return () => {
      clearInterval(interval)
      timersRef.current.forEach(clearTimeout)
    }
  }, [])

  return (
    <Ctx.Provider value={{ stocks, analyzing, refresh, hasApiKey }}>
      {children}
    </Ctx.Provider>
  )
}
