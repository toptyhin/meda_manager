/** Client-side sales-funnel unit economics: price table defaults + pure calculator. */

export type PriceProvider = 'CrazyRouter' | 'KIE AI' | 'ATLAS'

export type ModelPriceRow = {
  kind: 'image' | 'video'
  model: string
  /** USD per image (1K) or per video-second (720p). null = unavailable. */
  crazyRouter: number | null
  kieAi: number | null
  atlas: number | null
  /** Optional UI note (e.g. range / needs verification). */
  note?: string
}

export type ModelRef = {
  model: string
  provider: PriceProvider
}

/** What media counts toward tariff COGS / usage. */
export type TariffMediaScope = 'both' | 'images' | 'video'

export type SalesTariff = {
  id: string
  name: string
  /** Monthly price of the tariff, RUB. */
  priceRub: number
  /** Share of paying users (0–1). Normalized if sum ≠ 1. */
  share: number
  /**
   * `both` — images + video in the plan (sum COGS);
   * `images` / `video` — only that media type counts.
   */
  mediaScope: TariffMediaScope
  /** Most expensive image model available on this tariff — used for COGS. */
  maxImage: ModelRef
  /** Most expensive video model available on this tariff — used for COGS. */
  maxVideo: ModelRef
  imagesPerMonth: number
  videosPerMonth: number
  videoSeconds: number
}

export type SalesPlanPayload = {
  currencyRate: number
  funnel: {
    visitors: number
    /** 0–1 */
    cReg: number
    /** 0–1 among registered */
    cAct: number
    /** 0–1 among activated */
    cPay: number
  }
  freeTier: {
    imagesPerMonth: number
    videosPerMonth: number
    videoSeconds: number
    /** 0–1 share of activated users who consume the free quota */
    utilization: number
    /** Models available for free testing; COGS = max price among selected. */
    imageModels: ModelRef[]
    videoModels: ModelRef[]
  }
  referral: {
    /** 0–1 of referred user's payments paid out as reward */
    percent: number
    /** 0–1 of paying users who came via referral */
    shareOfPaying: number
  }
  tariffs: SalesTariff[]
  priceTable: ModelPriceRow[]
}

export type TariffBreakdown = {
  id: string
  name: string
  share: number
  priceRub: number
  mediaScope: TariffMediaScope
  unitCostRub: number
  paying: number
  revenueRub: number
  cogsRub: number
  imageCostUsd: number
  videoSecCostUsd: number
}

export type SalesPlanResult = {
  registered: number
  activated: number
  paying: number
  /** Weighted average check from tariffs. */
  arppuRub: number
  freeImageCostUsd: number
  freeVideoSecCostUsd: number
  freeUnitCostRub: number
  /** Share-weighted average paid unit cost. */
  paidUnitCostRub: number
  revenueRub: number
  freeCogsRub: number
  paidCogsRub: number
  referralPayoutRub: number
  totalCogsRub: number
  profitRub: number
  marginPct: number | null
  breakEvenCPay: number | null
  tariffs: TariffBreakdown[]
  /** Raw sum of tariff.share before normalization. */
  shareSum: number
}

export const PROVIDERS: PriceProvider[] = ['CrazyRouter', 'KIE AI', 'ATLAS']

/** Defaults from «Цены моделей по провайдерам.ods». Ranges → midpoint. */
export const DEFAULT_PRICE_TABLE: ModelPriceRow[] = [
  { kind: 'image', model: 'Nano-Banana pro', crazyRouter: 0.074, kieAi: null, atlas: 0.14 },
  { kind: 'image', model: 'Nano-Banana 2', crazyRouter: 0.037, kieAi: 0.04, atlas: null },
  { kind: 'image', model: 'GPT-image-2', crazyRouter: 0.038, kieAi: 0.03, atlas: 0.01 },
  { kind: 'image', model: 'Wan 2.7', crazyRouter: null, kieAi: 0.024, atlas: 0.03 },
  { kind: 'image', model: 'Qwen-image-2.0', crazyRouter: 0.029, kieAi: 0.028, atlas: null },
  { kind: 'image', model: 'Qwen-image-plus', crazyRouter: 0.029, kieAi: null, atlas: 0.06 },
  { kind: 'image', model: 'Seedream 4.5', crazyRouter: 0.036, kieAi: 0.0325, atlas: 0.036 },
  { kind: 'image', model: 'Seedream 5', crazyRouter: 0.031, kieAi: 0.0275, atlas: 0.036 },
  { kind: 'image', model: 'Kling Image 3', crazyRouter: 0.026, kieAi: null, atlas: null },
  { kind: 'image', model: 'Cog-view-4', crazyRouter: 0.01, kieAi: null, atlas: null },
  { kind: 'image', model: 'Dall-E-3', crazyRouter: 0.04, kieAi: null, atlas: null },
  { kind: 'image', model: 'FLUX 2 pro', crazyRouter: null, kieAi: null, atlas: 0.03 },
  { kind: 'image', model: 'FLUX schnell', crazyRouter: null, kieAi: null, atlas: 0.003 },
  { kind: 'image', model: 'MAI 2.5 t2i', crazyRouter: null, kieAi: null, atlas: 0.05 },
  { kind: 'image', model: 'MAI 2.5 i2i', crazyRouter: null, kieAi: null, atlas: 0.058 },
  { kind: 'image', model: 'GROK Imagine', crazyRouter: null, kieAi: null, atlas: 0.05 },
  {
    kind: 'video',
    model: 'Seedance 2',
    crazyRouter: 0.0529,
    kieAi: null,
    atlas: 0.112,
    note: 'CrazyRouter исходник «4–6,57» трактован как 0.04–0.0657 $/с — проверьте',
  },
  {
    kind: 'video',
    model: 'Kling 3',
    crazyRouter: 0.107,
    kieAi: 0.1013,
    atlas: 0.095,
    note: 'Диапазоны CrazyRouter/KIE → среднее',
  },
  {
    kind: 'video',
    model: 'Kling 3 motion',
    crazyRouter: 0.214,
    kieAi: null,
    atlas: null,
    note: 'Диапазон 0.107–0.321 → среднее',
  },
  {
    kind: 'video',
    model: 'Wan2.2 i2v PLUS',
    crazyRouter: 0.06,
    kieAi: null,
    atlas: null,
    note: 'Диапазон 0.02–0.1 → среднее',
  },
  {
    kind: 'video',
    model: 'Wan2.2 i2v FLASH',
    crazyRouter: 0.0415,
    kieAi: null,
    atlas: null,
    note: 'Диапазон 0.014–0.069 → среднее',
  },
  { kind: 'video', model: 'Wan 2.7', crazyRouter: null, kieAi: null, atlas: 0.1 },
  { kind: 'video', model: 'HappyHorse 1.1', crazyRouter: 0.1125, kieAi: null, atlas: 0.14 },
  { kind: 'video', model: 'VEO-3.1', crazyRouter: null, kieAi: null, atlas: 0.2 },
]

export function modelRefKey(ref: ModelRef): string {
  return `${ref.model}@@${ref.provider}`
}

export function parseModelRefKey(key: string): ModelRef | null {
  const i = key.lastIndexOf('@@')
  if (i <= 0) return null
  const model = key.slice(0, i)
  const provider = key.slice(i + 2) as PriceProvider
  if (!PROVIDERS.includes(provider)) return null
  return { model, provider }
}

export function availableModelOptions(
  table: ModelPriceRow[],
  kind: 'image' | 'video',
): { ref: ModelRef; priceUsd: number }[] {
  const out: { ref: ModelRef; priceUsd: number }[] = []
  for (const row of table) {
    if (row.kind !== kind) continue
    for (const provider of PROVIDERS) {
      const price = providerPrice(row, provider)
      if (price != null) out.push({ ref: { model: row.model, provider }, priceUsd: price })
    }
  }
  return out.sort((a, b) => a.priceUsd - b.priceUsd || a.ref.model.localeCompare(b.ref.model))
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createTariff(partial?: Partial<SalesTariff>): SalesTariff {
  return {
    name: 'Базовый',
    priceRub: 990,
    share: 1,
    mediaScope: 'both',
    maxImage: { model: 'Seedream 5', provider: 'CrazyRouter' },
    maxVideo: { model: 'Kling 3', provider: 'ATLAS' },
    imagesPerMonth: 40,
    videosPerMonth: 2,
    videoSeconds: 5,
    ...partial,
    id: partial?.id ?? newId(),
  }
}

export function defaultPayload(): SalesPlanPayload {
  return {
    currencyRate: 90,
    funnel: {
      visitors: 10000,
      cReg: 0.2,
      cAct: 0.5,
      cPay: 0.1,
    },
    freeTier: {
      imagesPerMonth: 10,
      videosPerMonth: 0,
      videoSeconds: 5,
      utilization: 0.6,
      imageModels: [
        { model: 'FLUX schnell', provider: 'ATLAS' },
        { model: 'Cog-view-4', provider: 'CrazyRouter' },
      ],
      videoModels: [],
    },
    referral: {
      percent: 0.2,
      shareOfPaying: 0.3,
    },
    tariffs: [
      createTariff({
        name: 'Старт',
        priceRub: 490,
        share: 0.6,
        maxImage: { model: 'Seedream 5', provider: 'CrazyRouter' },
        maxVideo: { model: 'Kling 3', provider: 'ATLAS' },
        imagesPerMonth: 30,
        videosPerMonth: 1,
        videoSeconds: 5,
      }),
      createTariff({
        name: 'Про',
        priceRub: 1490,
        share: 0.4,
        maxImage: { model: 'Nano-Banana pro', provider: 'ATLAS' },
        maxVideo: { model: 'VEO-3.1', provider: 'ATLAS' },
        imagesPerMonth: 80,
        videosPerMonth: 4,
        videoSeconds: 5,
      }),
    ],
    priceTable: DEFAULT_PRICE_TABLE.map((r) => ({ ...r })),
  }
}

function providerPrice(row: ModelPriceRow | undefined, provider: PriceProvider): number | null {
  if (!row) return null
  if (provider === 'CrazyRouter') return row.crazyRouter
  if (provider === 'KIE AI') return row.kieAi
  return row.atlas
}

export function lookupPrice(
  table: ModelPriceRow[],
  kind: 'image' | 'video',
  ref: ModelRef,
): number | null {
  const row = table.find((r) => r.kind === kind && r.model === ref.model)
  return providerPrice(row, ref.provider)
}

/** Max USD price among selected model refs (worst-case COGS). */
export function maxPriceAmong(
  table: ModelPriceRow[],
  kind: 'image' | 'video',
  refs: ModelRef[],
): number {
  let max = 0
  for (const ref of refs) {
    const p = lookupPrice(table, kind, ref)
    if (p != null && p > max) max = p
  }
  return max
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function nonNeg(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/** Apply mediaScope: zero out unused side for COGS. */
export function scopedTariffUsage(t: SalesTariff): {
  imagesPerMonth: number
  videosPerMonth: number
  videoSeconds: number
  includeImage: boolean
  includeVideo: boolean
} {
  const scope = t.mediaScope ?? 'both'
  const includeImage = scope === 'both' || scope === 'images'
  const includeVideo = scope === 'both' || scope === 'video'
  return {
    imagesPerMonth: includeImage ? nonNeg(t.imagesPerMonth) : 0,
    videosPerMonth: includeVideo ? nonNeg(t.videosPerMonth) : 0,
    videoSeconds: includeVideo ? nonNeg(t.videoSeconds) : 0,
    includeImage,
    includeVideo,
  }
}

function unitCostRub(
  images: number,
  videos: number,
  videoSeconds: number,
  imageCostUsd: number,
  videoSecCostUsd: number,
  rate: number,
): number {
  const usd =
    nonNeg(images) * nonNeg(imageCostUsd) +
    nonNeg(videos) * nonNeg(videoSeconds) * nonNeg(videoSecCostUsd)
  return usd * nonNeg(rate)
}

function normalizeShares(tariffs: SalesTariff[]): { shares: number[]; shareSum: number } {
  const raw = tariffs.map((t) => nonNeg(t.share))
  const shareSum = raw.reduce((a, b) => a + b, 0)
  if (shareSum <= 0) {
    const eq = tariffs.length > 0 ? 1 / tariffs.length : 0
    return { shares: tariffs.map(() => eq), shareSum }
  }
  return { shares: raw.map((s) => s / shareSum), shareSum }
}

/** Pure unit-economics calculator. Safe with incomplete / NaN inputs. */
export function computeSalesPlan(payload: SalesPlanPayload): SalesPlanResult {
  const visitors = nonNeg(payload.funnel.visitors)
  const cReg = clamp01(payload.funnel.cReg)
  const cAct = clamp01(payload.funnel.cAct)
  const cPay = clamp01(payload.funnel.cPay)
  const registered = visitors * cReg
  const activated = registered * cAct
  const paying = activated * cPay

  const rate = nonNeg(payload.currencyRate)
  const util = clamp01(payload.freeTier.utilization)
  const refPct = clamp01(payload.referral.percent)
  const shareRef = clamp01(payload.referral.shareOfPaying)

  const freeImageCostUsd = maxPriceAmong(
    payload.priceTable,
    'image',
    payload.freeTier.imageModels,
  )
  const freeVideoSecCostUsd = maxPriceAmong(
    payload.priceTable,
    'video',
    payload.freeTier.videoModels,
  )
  const freeUnitCostRub = unitCostRub(
    payload.freeTier.imagesPerMonth,
    payload.freeTier.videosPerMonth,
    payload.freeTier.videoSeconds,
    freeImageCostUsd,
    freeVideoSecCostUsd,
    rate,
  )

  const { shares, shareSum } = normalizeShares(payload.tariffs)
  const tariffRows: TariffBreakdown[] = payload.tariffs.map((t, i) => {
    const share = shares[i] ?? 0
    const usage = scopedTariffUsage(t)
    const imageCostUsd = usage.includeImage
      ? nonNeg(lookupPrice(payload.priceTable, 'image', t.maxImage) ?? 0)
      : 0
    const videoSecCostUsd = usage.includeVideo
      ? nonNeg(lookupPrice(payload.priceTable, 'video', t.maxVideo) ?? 0)
      : 0
    const unitCostRubVal = unitCostRub(
      usage.imagesPerMonth,
      usage.videosPerMonth,
      usage.videoSeconds,
      imageCostUsd,
      videoSecCostUsd,
      rate,
    )
    const tPaying = paying * share
    const priceRub = nonNeg(t.priceRub)
    return {
      id: t.id,
      name: t.name,
      share,
      priceRub,
      mediaScope: t.mediaScope ?? 'both',
      unitCostRub: unitCostRubVal,
      paying: tPaying,
      revenueRub: tPaying * priceRub,
      cogsRub: tPaying * unitCostRubVal,
      imageCostUsd,
      videoSecCostUsd,
    }
  })

  const arppuRub = tariffRows.reduce((acc, t) => acc + t.share * t.priceRub, 0)
  const paidUnitCostRub = tariffRows.reduce((acc, t) => acc + t.share * t.unitCostRub, 0)

  const revenueRub = tariffRows.reduce((acc, t) => acc + t.revenueRub, 0)
  const freeCogsRub = activated * util * freeUnitCostRub
  const paidCogsRub = tariffRows.reduce((acc, t) => acc + t.cogsRub, 0)
  const referralPayoutRub = revenueRub * shareRef * refPct
  const totalCogsRub = freeCogsRub + paidCogsRub + referralPayoutRub
  const profitRub = revenueRub - totalCogsRub
  const marginPct = revenueRub > 0 ? (profitRub / revenueRub) * 100 : null

  const netPerPayer = arppuRub * (1 - shareRef * refPct) - paidUnitCostRub
  let breakEvenCPay: number | null = null
  if (activated > 0 && netPerPayer > 0) {
    breakEvenCPay = freeCogsRub / (activated * netPerPayer)
    if (!Number.isFinite(breakEvenCPay)) breakEvenCPay = null
  }

  return {
    registered,
    activated,
    paying,
    arppuRub,
    freeImageCostUsd,
    freeVideoSecCostUsd,
    freeUnitCostRub,
    paidUnitCostRub,
    revenueRub,
    freeCogsRub,
    paidCogsRub,
    referralPayoutRub,
    totalCogsRub,
    profitRub,
    marginPct,
    breakEvenCPay,
    tariffs: tariffRows,
    shareSum,
  }
}

export function formatMoney(n: number, digits = 0): string {
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatPct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

export function deepClonePayload(p: SalesPlanPayload): SalesPlanPayload {
  return structuredClone(p)
}

export function payloadsEqual(a: SalesPlanPayload, b: SalesPlanPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function coerceModelRef(raw: unknown, fallback: ModelRef): ModelRef {
  if (!raw || typeof raw !== 'object') return fallback
  const r = raw as Partial<ModelRef>
  const provider = PROVIDERS.includes(r.provider as PriceProvider)
    ? (r.provider as PriceProvider)
    : fallback.provider
  return {
    model: typeof r.model === 'string' && r.model ? r.model : fallback.model,
    provider,
  }
}

function coerceMediaScope(raw: unknown, fallback: TariffMediaScope): TariffMediaScope {
  if (raw === 'both' || raw === 'images' || raw === 'video') return raw
  return fallback
}

function coerceTariff(raw: unknown, fallback: SalesTariff): SalesTariff {
  if (!raw || typeof raw !== 'object') return fallback
  const r = raw as Partial<SalesTariff>
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    name: typeof r.name === 'string' && r.name ? r.name : fallback.name,
    priceRub: nonNeg(Number(r.priceRub)),
    share: nonNeg(Number(r.share)),
    mediaScope: coerceMediaScope(r.mediaScope, fallback.mediaScope ?? 'both'),
    maxImage: coerceModelRef(r.maxImage, fallback.maxImage),
    maxVideo: coerceModelRef(r.maxVideo, fallback.maxVideo),
    imagesPerMonth: nonNeg(Number(r.imagesPerMonth)),
    videosPerMonth: nonNeg(Number(r.videosPerMonth)),
    videoSeconds: nonNeg(Number(r.videoSeconds)),
  }
}

/** Merge saved/API payload with defaults; migrates legacy fields if present. */
export function coercePayload(raw: unknown): SalesPlanPayload {
  const base = defaultPayload()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  const freeRaw = (r.freeTier as Record<string, unknown> | undefined) ?? {}

  let tariffs: SalesTariff[]
  if (Array.isArray(r.tariffs) && r.tariffs.length > 0) {
    tariffs = r.tariffs.map((t, i) =>
      coerceTariff(t, base.tariffs[i] ?? createTariff({ name: `Тариф ${i + 1}` })),
    )
  } else {
    // Legacy: single ARPPU + costBasis + paidUsage → one tariff
    const legacy = r as {
      arppuRub?: number
      costBasis?: {
        imageModel?: string
        imageProvider?: PriceProvider
        videoModel?: string
        videoProvider?: PriceProvider
      }
      paidUsage?: {
        imagesPerMonth?: number
        videosPerMonth?: number
        videoSeconds?: number
      }
    }
    tariffs = [
      createTariff({
        name: 'Единый',
        priceRub: nonNeg(Number(legacy.arppuRub ?? base.tariffs[0].priceRub)),
        share: 1,
        maxImage: {
          model: legacy.costBasis?.imageModel ?? base.tariffs[0].maxImage.model,
          provider: legacy.costBasis?.imageProvider ?? base.tariffs[0].maxImage.provider,
        },
        maxVideo: {
          model: legacy.costBasis?.videoModel ?? base.tariffs[0].maxVideo.model,
          provider: legacy.costBasis?.videoProvider ?? base.tariffs[0].maxVideo.provider,
        },
        imagesPerMonth: nonNeg(
          Number(legacy.paidUsage?.imagesPerMonth ?? base.tariffs[0].imagesPerMonth),
        ),
        videosPerMonth: nonNeg(
          Number(legacy.paidUsage?.videosPerMonth ?? base.tariffs[0].videosPerMonth),
        ),
        videoSeconds: nonNeg(
          Number(legacy.paidUsage?.videoSeconds ?? base.tariffs[0].videoSeconds),
        ),
      }),
    ]
  }

  const imageModels = Array.isArray(freeRaw.imageModels)
    ? (freeRaw.imageModels as unknown[])
        .map((m) => coerceModelRef(m, base.freeTier.imageModels[0]))
        .filter(Boolean)
    : base.freeTier.imageModels
  const videoModels = Array.isArray(freeRaw.videoModels)
    ? (freeRaw.videoModels as unknown[])
        .map((m) => coerceModelRef(m, { model: 'Kling 3', provider: 'ATLAS' }))
        .filter(Boolean)
    : base.freeTier.videoModels

  return {
    currencyRate: nonNeg(Number(r.currencyRate ?? base.currencyRate)),
    funnel: {
      ...base.funnel,
      ...((r.funnel as object) ?? {}),
    },
    freeTier: {
      imagesPerMonth: nonNeg(Number(freeRaw.imagesPerMonth ?? base.freeTier.imagesPerMonth)),
      videosPerMonth: nonNeg(Number(freeRaw.videosPerMonth ?? base.freeTier.videosPerMonth)),
      videoSeconds: nonNeg(Number(freeRaw.videoSeconds ?? base.freeTier.videoSeconds)),
      utilization: clamp01(Number(freeRaw.utilization ?? base.freeTier.utilization)),
      imageModels,
      videoModels,
    },
    referral: {
      ...base.referral,
      ...((r.referral as object) ?? {}),
    },
    tariffs,
    priceTable:
      Array.isArray(r.priceTable) && r.priceTable.length > 0
        ? (r.priceTable as ModelPriceRow[]).map((row) => ({ ...row }))
        : base.priceTable,
  }
}
