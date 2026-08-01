export const GEN_SIZES = ['1K', '2K', '3K', '4K'] as const
export const GEN_RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'] as const

export type GenPrefs = {
  size: (typeof GEN_SIZES)[number]
  ratio: (typeof GEN_RATIOS)[number]
  auto_review: boolean
}

export const DEFAULT_GEN_PREFS: GenPrefs = { size: '1K', ratio: '1:1', auto_review: false }

export function isGenSize(v: string): v is GenPrefs['size'] {
  return (GEN_SIZES as readonly string[]).includes(v)
}

export function isGenRatio(v: string): v is GenPrefs['ratio'] {
  return (GEN_RATIOS as readonly string[]).includes(v)
}
