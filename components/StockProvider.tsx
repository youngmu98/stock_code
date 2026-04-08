'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { TICKERS } from '@/lib/constants'
import type { StockAnalysis } from '@/lib/types'

// ── 로컬스토리지 캐시 ──────────────────────────────────────
const LS_KEY = 'stock-cache-v1'
const STALE_MS = 5 * 60 * 1000 // 5분
const STAGGER_MS = 2500         // 2.5초 간격 (≈24 req/min, Groq 30 RPM 이내)

interface CacheEntry { data: StockAnalysis; fetchedAt: number }
type CacheStore = Partial<Record<string, CacheEntry>>

function loadLS(): CacheStore {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveLS(store: CacheStore) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store))
  } catch {}
}

// ── Context ────────────────────────────────────────────────
interface StockCtx {
  stocks: Map<string, StockAnalysis>
  analyzing: Set<string>  // 현재 AI 분석 중인 ticker
  refresh: (ticker?: string) => void  // 특정 종목 또는 전체 즉시 갱신
}

const Ctx = createContext<StockCtx>({
  stocks: new Map(),
  analyzing: new Set(),
  refresh: () => {},
})

export function useStocks() {
  return useContext(Ctx)
}

// ── Provider ───────────────────────────────────────────────
export function StockProvider({ children }: { children: React.ReactNode }) {
  const [stocks, setStocks] = useState<Map<string, StockAnalysis>>(() => {
    const cache = loadLS()
    return new Map(
      Object.entries(cache)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, v!.data]),
    )
  })
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set())

  // localStorage를 ref로 관리 (렌더 불필요)
  const cacheRef = useRef<CacheStore>(loadLS())

  const setStock = useCallback((data: StockAnalysis, fromAnalyze = false) => {
    setStocks((prev) => {
      const existing = prev.get(data.ticker)
      if (!fromAnalyze && existing?.reasoning) {
        // 가격 갱신: AI 분석 결과는 유지하고 가격/지표 필드만 교체
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
      // 첫 로드이거나 AI 분석 완료 시: 전체 교체
      return new Map(prev).set(data.ticker, data)
    })
    if (fromAnalyze) {
      cacheRef.current = {
        ...cacheRef.current,
        [data.ticker]: { data, fetchedAt: Date.now() },
      }
      saveLS(cacheRef.current)
    }
  }, [])

  // 단일 종목 가격 fetch (빠름, AI 없음)
  const fetchPrice = useCallback(
    async (ticker: string) => {
      try {
        const res = await fetch(`/api/price/${ticker}`, { cache: 'no-store' })
        if (res.ok) {
          const data: StockAnalysis = await res.json()
          if (data?.ticker) setStock(data, false)
        }
      } catch {}
    },
    [setStock],
  )

  // 단일 종목 AI 분석 fetch
  const fetchAnalyze = useCallback(
    async (ticker: string) => {
      setAnalyzing((prev) => new Set(prev).add(ticker))
      try {
        const res = await fetch(`/api/analyze/${ticker}`, { cache: 'no-store' })
        if (res.ok) {
          const data: StockAnalysis = await res.json()
          if (data?.ticker) setStock(data, true)
        }
      } catch {
      } finally {
        setAnalyzing((prev) => {
          const s = new Set(prev)
          s.delete(ticker)
          return s
        })
      }
    },
    [setStock],
  )

  // 전체 갱신 (가격 즉시 → 분석 순차)
  const refreshAllRef = useRef<() => void>(() => {})
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const refreshAll = useCallback(() => {
    // 진행 중인 타이머 취소
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    // 1) 가격: 전체 병렬 (API만 호출, Groq 없음)
    TICKERS.forEach((t) => fetchPrice(t))

    // 2) AI 분석: 2.5초 간격 순차
    TICKERS.forEach((ticker, i) => {
      const id = setTimeout(() => fetchAnalyze(ticker), i * STAGGER_MS)
      timersRef.current.push(id)
    })
  }, [fetchPrice, fetchAnalyze])

  // 외부에서 특정 종목 우선 갱신 또는 전체 갱신
  const refresh = useCallback(
    (ticker?: string) => {
      if (ticker) {
        fetchPrice(ticker)
        fetchAnalyze(ticker)
      } else {
        refreshAll()
      }
    },
    [fetchPrice, fetchAnalyze, refreshAll],
  )

  refreshAllRef.current = refreshAll

  useEffect(() => {
    // 마운트 시 즉시 갱신
    refreshAllRef.current()

    // 5분마다 백그라운드 갱신
    const interval = setInterval(() => refreshAllRef.current(), STALE_MS)

    return () => {
      clearInterval(interval)
      timersRef.current.forEach(clearTimeout)
    }
  }, [])

  return (
    <Ctx.Provider value={{ stocks, analyzing, refresh }}>
      {children}
    </Ctx.Provider>
  )
}
