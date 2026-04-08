// 한국투자증권 Open API 클라이언트
// 문서: https://apiportal.koreainvestment.com/

const BASE_URL = 'https://openapi.koreainvestment.com:9443'

// ── 토큰 관리 (서버 메모리 캐시, 유효기간 23시간) ──────────
interface TokenCache {
  token: string
  expiresAt: number
}
let tokenCache: TokenCache | null = null

async function getAccessToken(): Promise<string> {
  const appKey = process.env.KIS_APP_KEY
  const appSecret = process.env.KIS_APP_SECRET
  if (!appKey || !appSecret) throw new Error('KIS_APP_KEY / KIS_APP_SECRET 미설정')

  // 캐시 유효하면 재사용
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token
  }

  const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: appKey,
      appsecret: appSecret,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`KIS 토큰 발급 실패 ${res.status}: ${err.slice(0, 100)}`)
  }

  const data = await res.json()
  const token: string = data.access_token
  // 만료 23시간으로 보수적 설정 (실제 24시간)
  tokenCache = { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 }
  return token
}

// ── 공통 헤더 생성 ──────────────────────────────────────────
async function kisHeaders(trId: string): Promise<HeadersInit> {
  const token = await getAccessToken()
  return {
    'Content-Type': 'application/json',
    authorization: `Bearer ${token}`,
    appkey: process.env.KIS_APP_KEY!,
    appsecret: process.env.KIS_APP_SECRET!,
    tr_id: trId,
    custtype: 'P',
  }
}

// ── 현재가 조회 ─────────────────────────────────────────────
export interface KrQuote {
  currentPrice: number   // 현재가 (원)
  changePercent: number  // 전일 대비 등락률
  volume: number         // 거래량
}

export async function getKrQuote(ticker: string, market: 'J' | 'Q' = 'J'): Promise<KrQuote> {
  const headers = await kisHeaders('FHKST01010100')
  const url =
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price` +
    `?FID_COND_MRKT_DIV_CODE=${market}&FID_INPUT_ISCD=${ticker}`

  const res = await fetch(url, { headers, next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`KIS 현재가 ${res.status}`)

  const data = await res.json()
  const output = data.output

  if (!output || data.rt_cd !== '0') {
    throw new Error(`KIS 응답 오류: ${data.msg1 ?? '알 수 없음'}`)
  }

  return {
    currentPrice: parseInt(output.stck_prpr, 10),  // 주식 현재가
    changePercent: parseFloat(output.prdy_ctrt),   // 전일 대비율
    volume: parseInt(output.acml_vol, 10),          // 누적 거래량
  }
}

// ── 일봉 히스토리 조회 (RSI/MA 계산용) ─────────────────────
export interface KrOhlcv {
  date: string
  close: number
  volume: number
}

export async function getKrDailyOhlcv(
  ticker: string,
  market: 'J' | 'Q' = 'J',
  count = 65,
): Promise<KrOhlcv[]> {
  const headers = await kisHeaders('FHKST01010400')
  const url =
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-price` +
    `?FID_COND_MRKT_DIV_CODE=${market}` +
    `&FID_INPUT_ISCD=${ticker}` +
    `&FID_PERIOD_DIV_CODE=D` +   // 일봉
    `&FID_ORG_ADJ_PRC=1`         // 수정주가

  const res = await fetch(url, { headers, next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`KIS 일봉 ${res.status}`)

  const data = await res.json()
  if (data.rt_cd !== '0') throw new Error(`KIS 일봉 오류: ${data.msg1}`)

  const rows: Array<{ stck_bsop_date: string; stck_clpr: string; acml_vol: string }> =
    data.output2 ?? []

  return rows
    .slice(0, count)
    .reverse() // 오래된 것부터 정렬
    .map((r) => ({
      date: r.stck_bsop_date,
      close: parseInt(r.stck_clpr, 10),
      volume: parseInt(r.acml_vol, 10),
    }))
    .filter((r) => r.close > 0)
}
