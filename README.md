# 주식 시그널 대시보드

AI(Claude)와 기술적 지표(RSI)를 결합해 주요 종목의 매수/매도 시그널을 실시간으로 보여주는 대시보드입니다.

## 기능

- **AI 뉴스 분석**: Anthropic Claude API로 최신 뉴스 감성 분석
- **RSI 기술적 지표**: 14일 RSI 계산으로 과매수/과매도 판단
- **시그널 생성**: AI 점수 + RSI를 결합한 매수/매도/관망 시그널
- **1시간 캐시**: 불필요한 API 호출 방지
- **API 없이 실행 가능**: 환경 변수 없으면 mock 데이터로 동작

## 기술 스택

- **Framework**: Next.js 14 (App Router)
- **UI**: Tailwind CSS, shadcn/ui
- **AI**: Anthropic Claude API (`claude-sonnet-4-6`)
- **데이터**: Polygon.io (주가), NewsAPI (뉴스)
- **지표**: technicalindicators (RSI)

## 로컬 실행

```bash
npm install
npm run dev
```

API 없이도 mock 데이터로 바로 확인 가능합니다.

### 환경 변수 (선택)

실제 데이터를 사용하려면 `.env.local` 파일을 생성하세요:

```env
POLYGON_API_KEY=your_polygon_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

- **Polygon.io**: [polygon.io](https://polygon.io) — 무료 플랜으로 주가 데이터 제공
- **Anthropic**: [console.anthropic.com](https://console.anthropic.com) — Claude API 키 발급

## 아키텍처

```
Data Layer    → Polygon.io (주가) + NewsAPI (뉴스)
AI Layer      → Claude: 뉴스 감성 분석 → 테마 점수
Strategy      → RSI + AI 점수 → 매수/매도 시그널 (0–100)
UI Layer      → 카드 그리드 + 클릭 시 분석 근거 모달
```

## 시그널 기준

| 시그널 | 점수 범위 |
|--------|-----------|
| 매수   | > 60      |
| 관망   | 40 – 60   |
| 매도   | < 40      |

## Vercel 배포

아래 "Vercel 배포 방법" 섹션 참고.
