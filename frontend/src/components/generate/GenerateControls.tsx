import { SettingsIconButton } from '../SettingsIconButton'
import {
  GEN_RATIOS,
  GEN_SIZES,
  isGenRatio,
  isGenSize,
  type GenPrefs,
} from '../../lib/genPrefs'

type Props = {
  prefs: GenPrefs
  onChange: (patch: Partial<GenPrefs>) => void
  canImprove: boolean
  improving: boolean
  onImprove: () => void
  onShowTplSettings: () => void
  submitDisabled: boolean
  submitLabel: string
  busy: boolean
  onSubmit: () => void
}

export function GenerateControls({
  prefs,
  onChange,
  canImprove,
  improving,
  onImprove,
  onShowTplSettings,
  submitDisabled,
  submitLabel,
  busy,
  onSubmit,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <label className="text-sm">
        <span className="text-muted block mb-1">Size</span>
        <select
          className="rounded-md border border-line bg-paper px-2 py-1.5"
          value={prefs.size}
          onChange={(e) => {
            if (isGenSize(e.target.value)) onChange({ size: e.target.value })
          }}
        >
          {GEN_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="text-muted block mb-1">Ratio</span>
        <select
          className="rounded-md border border-line bg-paper px-2 py-1.5"
          value={prefs.ratio}
          onChange={(e) => {
            if (isGenRatio(e.target.value)) onChange({ ratio: e.target.value })
          }}
        >
          {GEN_RATIOS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm flex items-center gap-2 pb-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          className="rounded border-line"
          checked={prefs.auto_review}
          onChange={(e) => onChange({ auto_review: e.target.checked })}
        />
        <span>
          Автопроверка и исправление
          <span className="block text-xs text-muted">
            до ~3× дольше · оценка качества + автоправка
          </span>
        </span>
      </label>
      <div className="ml-auto self-end flex flex-wrap gap-2">
        <div className="inline-flex items-stretch gap-1">
          <button
            type="button"
            disabled={!canImprove || improving}
            onClick={onImprove}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm hover:bg-line/40 disabled:opacity-50"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z" />
              <path d="m14 7 3 3" />
              <path d="M5 6v4" />
              <path d="M19 14v4" />
              <path d="M10 2v2" />
              <path d="M7 8H3" />
              <path d="M21 16h-4" />
              <path d="M11 3H9" />
            </svg>
            {improving ? 'Улучшаем…' : 'Улучшить промпт'}
          </button>
          <SettingsIconButton onClick={onShowTplSettings} />
        </div>
        <button
          type="button"
          disabled={submitDisabled || busy}
          onClick={onSubmit}
          className="rounded-lg bg-accent hover:bg-accent-hover text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Запуск…' : submitLabel}
        </button>
      </div>
    </div>
  )
}
