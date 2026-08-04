import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { salesPlanApi } from '../api'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import {
  availableModelOptions,
  coercePayload,
  computeSalesPlan,
  createTariff,
  deepClonePayload,
  defaultPayload,
  formatMoney,
  formatPct,
  modelRefKey,
  parseModelRefKey,
  payloadsEqual,
  type ModelPriceRow,
  type ModelRef,
  type SalesPlanPayload,
  type SalesPlanResult,
  type SalesTariff,
  type TariffMediaScope,
} from '../lib/salesPlan'
import type { SalesPlanScenario } from '../types'

const inputCls = 'rounded-lg border border-line bg-paper px-3 py-2 text-sm w-full'
const selectCls = 'rounded-lg border border-line bg-paper px-2 py-1.5 text-sm w-full'
const labelCls = 'block text-xs text-muted mb-1'

const CHART_COLORS = [
  '#c45c26',
  '#2f6f4e',
  '#3d5a80',
  '#9a6b3f',
  '#6b655c',
  '#a33b2b',
  '#4a7c59',
  '#8b5e3c',
]

function pctInput(fraction: number): string {
  return String(Math.round(fraction * 1000) / 10)
}

function parsePct(value: string): number {
  const n = Number(value.replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n)) / 100
}

function parseNum(value: string): number {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function ResultCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'good' | 'bad' | 'neutral'
}) {
  const toneCls =
    tone === 'good' ? 'text-ok' : tone === 'bad' ? 'text-bad' : 'text-ink'
  return (
    <div className="rounded-xl border border-line bg-paper/60 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-card p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function FunnelChart({
  visitors,
  result,
}: {
  visitors: number
  result: SalesPlanResult
}) {
  const stages = [
    { label: 'Посетители', value: visitors },
    { label: 'Регистрации', value: result.registered },
    { label: 'Активация', value: result.activated },
    { label: 'Оплата', value: result.paying },
  ]
  const max = Math.max(...stages.map((s) => s.value), 1)
  return (
    <div className="space-y-2" aria-label="Воронка">
      {stages.map((s, i) => {
        const w = Math.max(4, (s.value / max) * 100)
        return (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <div className="w-24 shrink-0 text-muted">{s.label}</div>
            <div className="flex-1 h-6 rounded bg-paper border border-line overflow-hidden">
              <div
                className="h-full rounded transition-[width] duration-300"
                style={{
                  width: `${w}%`,
                  background: `color-mix(in srgb, ${CHART_COLORS[0]} ${100 - i * 18}%, #d9d2c5)`,
                }}
              />
            </div>
            <div className="w-16 text-right tabular-nums font-medium">
              {formatMoney(s.value, 0)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StackedCostChart({ result }: { result: SalesPlanResult }) {
  const expenseRows = [
    { label: 'Free tier', value: result.freeCogsRub, color: '#9a6b3f' },
    { label: 'Платные COGS', value: result.paidCogsRub, color: '#3d5a80' },
    { label: 'Рефералка', value: result.referralPayoutRub, color: '#6b655c' },
  ]
  const parts = [
    ...expenseRows,
    {
      label: 'Прибыль',
      value: Math.max(0, result.profitRub),
      color: '#2f6f4e',
    },
  ]
  const loss = result.profitRub < 0 ? Math.abs(result.profitRub) : 0
  const denom = Math.max(result.revenueRub, result.totalCogsRub, 1)
  const expenseMax = Math.max(...expenseRows.map((r) => r.value), 1)

  return (
    <div className="space-y-3" aria-label="Структура P&L">
      <div>
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>Выручка</span>
          <span className="tabular-nums">{formatMoney(result.revenueRub, 0)} ₽</span>
        </div>
        <div className="h-7 rounded border border-line overflow-hidden bg-paper">
          <div
            className="h-full transition-[width] duration-300"
            style={{
              width: `${Math.min(100, (result.revenueRub / denom) * 100)}%`,
              background: CHART_COLORS[0],
            }}
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-muted mb-1.5">
          <span>Расходы (в т.ч. free tier)</span>
          <span className="tabular-nums">{formatMoney(result.totalCogsRub, 0)} ₽</span>
        </div>
        <div className="space-y-1.5">
          {expenseRows.map((row) => {
            const w = Math.max(row.value > 0 ? 3 : 0, (row.value / expenseMax) * 100)
            return (
              <div key={row.label} className="flex items-center gap-2 text-xs">
                <div className="w-[5.5rem] shrink-0 text-muted truncate">{row.label}</div>
                <div className="flex-1 h-5 rounded bg-paper border border-line overflow-hidden">
                  <div
                    className="h-full transition-[width] duration-300"
                    style={{ width: `${w}%`, background: row.color }}
                  />
                </div>
                <div
                  className={`w-[4.5rem] text-right tabular-nums font-medium ${
                    row.label === 'Free tier' ? 'text-accent' : ''
                  }`}
                >
                  {formatMoney(row.value, 0)} ₽
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>Структура vs выручка</span>
          <span className="tabular-nums">
            {formatMoney(result.totalCogsRub + Math.max(0, result.profitRub), 0)} ₽
          </span>
        </div>
        <div className="h-7 rounded border border-line overflow-hidden bg-paper flex">
          {parts.map((p) => {
            const w = (p.value / denom) * 100
            if (w <= 0) return null
            return (
              <div
                key={p.label}
                title={`${p.label}: ${formatMoney(p.value, 0)} ₽`}
                className="h-full transition-[width] duration-300"
                style={{ width: `${w}%`, background: p.color }}
              />
            )
          })}
          {loss > 0 && (
            <div
              title={`Убыток: ${formatMoney(loss, 0)} ₽`}
              className="h-full"
              style={{
                width: `${(loss / denom) * 100}%`,
                background: '#a33b2b',
              }}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-muted">
          {parts.map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: p.color }}
              />
              {p.label}
              <span className="tabular-nums">
                {formatMoney(p.value, 0)} ₽
              </span>
            </span>
          ))}
          {loss > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-bad" />
              Убыток {formatMoney(loss, 0)} ₽
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function TariffMixChart({ result }: { result: SalesPlanResult }) {
  const rows = result.tariffs.filter((t) => t.share > 0)
  if (rows.length === 0) {
    return <p className="text-xs text-muted">Нет тарифов с ненулевой долей.</p>
  }
  const size = 120
  const cx = size / 2
  const cy = size / 2
  const r = 48
  const rInner = 28
  let angle = -Math.PI / 2
  const slices = rows.map((t, i) => {
    const sweep = t.share * Math.PI * 2
    const start = angle
    angle += sweep
    const end = angle
    const large = sweep > Math.PI ? 1 : 0
    const x1 = cx + r * Math.cos(start)
    const y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end)
    const y2 = cy + r * Math.sin(end)
    const ix1 = cx + rInner * Math.cos(end)
    const iy1 = cy + rInner * Math.sin(end)
    const ix2 = cx + rInner * Math.cos(start)
    const iy2 = cy + rInner * Math.sin(start)
    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${rInner} ${rInner} 0 ${large} 0 ${ix2} ${iy2}`,
      'Z',
    ].join(' ')
    return { t, d, color: CHART_COLORS[i % CHART_COLORS.length] }
  })

  return (
    <div className="flex items-center gap-4" aria-label="Микс тарифов">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {slices.map((s) => (
          <path key={s.t.id} d={s.d} fill={s.color}>
            <title>
              {s.t.name}: {formatPct(s.t.share)} · {formatMoney(s.t.priceRub, 0)} ₽
            </title>
          </path>
        ))}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-muted"
          style={{ fontSize: 9 }}
        >
          ARPPU
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          className="fill-ink"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          {formatMoney(result.arppuRub, 0)}
        </text>
      </svg>
      <ul className="space-y-1 text-xs min-w-0">
        {slices.map((s) => (
          <li key={s.t.id} className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: s.color }}
            />
            <span className="truncate">{s.t.name}</span>
            <span className="tabular-nums text-muted ml-auto">
              {formatPct(s.t.share)} · {formatMoney(s.t.priceRub, 0)} ₽
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ModelSelect({
  kind,
  table,
  value,
  onChange,
}: {
  kind: 'image' | 'video'
  table: ModelPriceRow[]
  value: ModelRef
  onChange: (ref: ModelRef) => void
}) {
  const options = availableModelOptions(table, kind)
  const key = modelRefKey(value)
  return (
    <select
      className={selectCls}
      value={options.some((o) => modelRefKey(o.ref) === key) ? key : options[0] ? modelRefKey(options[0].ref) : ''}
      onChange={(e) => {
        const ref = parseModelRefKey(e.target.value)
        if (ref) onChange(ref)
      }}
    >
      {options.map((o) => (
        <option key={modelRefKey(o.ref)} value={modelRefKey(o.ref)}>
          {o.ref.model} · {o.ref.provider} ({o.priceUsd.toFixed(4)} $)
        </option>
      ))}
    </select>
  )
}

function ModelMultiSelect({
  kind,
  table,
  value,
  onChange,
}: {
  kind: 'image' | 'video'
  table: ModelPriceRow[]
  value: ModelRef[]
  onChange: (refs: ModelRef[]) => void
}) {
  const options = availableModelOptions(table, kind)
  const selected = new Set(value.map(modelRefKey))
  return (
    <div className="max-h-40 overflow-y-auto rounded-lg border border-line bg-paper p-2 space-y-1">
      {options.length === 0 && (
        <p className="text-xs text-muted">Нет цен в справочнике</p>
      )}
      {options.map((o) => {
        const key = modelRefKey(o.ref)
        const checked = selected.has(key)
        return (
          <label
            key={key}
            className="flex items-center gap-2 text-xs cursor-pointer hover:bg-card rounded px-1 py-0.5"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                if (checked) onChange(value.filter((r) => modelRefKey(r) !== key))
                else onChange([...value, o.ref])
              }}
            />
            <span className="truncate">
              {o.ref.model} · {o.ref.provider}
            </span>
            <span className="ml-auto tabular-nums text-muted shrink-0">
              {o.priceUsd.toFixed(4)} $
            </span>
          </label>
        )
      })}
    </div>
  )
}

function PriceTableEditor({
  rows,
  onChange,
}: {
  rows: ModelPriceRow[]
  onChange: (next: ModelPriceRow[]) => void
}) {
  const setCell = (
    idx: number,
    key: 'crazyRouter' | 'kieAi' | 'atlas',
    value: string,
  ) => {
    const trimmed = value.trim()
    const next = rows.map((r, i) => {
      if (i !== idx) return r
      if (trimmed === '') return { ...r, [key]: null }
      const n = Number(trimmed.replace(',', '.'))
      return { ...r, [key]: Number.isFinite(n) ? n : r[key] }
    })
    onChange(next)
  }

  const images = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.kind === 'image')
  const videos = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.kind === 'video')

  const renderTable = (items: { r: ModelPriceRow; i: number }[], unit: string) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-muted border-b border-line">
            <th className="py-1.5 pr-2 font-medium">Модель</th>
            <th className="py-1.5 px-1 font-medium">CrazyRouter</th>
            <th className="py-1.5 px-1 font-medium">KIE AI</th>
            <th className="py-1.5 px-1 font-medium">ATLAS</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ r, i }) => (
            <tr key={`${r.kind}-${r.model}`} className="border-b border-line/60">
              <td className="py-1.5 pr-2 whitespace-nowrap">
                {r.model}
                <span className="text-[10px] text-muted ml-1">{unit}</span>
              </td>
              {(['crazyRouter', 'kieAi', 'atlas'] as const).map((key) => (
                <td key={key} className="py-1 px-1">
                  <input
                    className="rounded border border-line bg-paper px-1.5 py-1 text-xs w-20 tabular-nums"
                    inputMode="decimal"
                    value={r[key] == null ? '' : String(r[key])}
                    placeholder="—"
                    aria-label={`${r.model} ${key}`}
                    onChange={(e) => setCell(i, key, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-medium text-muted mb-1">Изображения 1K (USD / шт.)</h3>
        {renderTable(images, '$/img')}
      </div>
      <div>
        <h3 className="text-xs font-medium text-muted mb-1">Видео 720p (USD / сек.)</h3>
        {renderTable(videos, '$/s')}
      </div>
      <button
        type="button"
        className="text-xs text-accent hover:underline"
        onClick={() => onChange(defaultPayload().priceTable)}
      >
        Сбросить справочник к дефолтам из ODS
      </button>
    </div>
  )
}

function TariffsEditor({
  tariffs,
  table,
  onChange,
}: {
  tariffs: SalesTariff[]
  table: ModelPriceRow[]
  onChange: (next: SalesTariff[]) => void
}) {
  const update = (id: string, patch: Partial<SalesTariff>) => {
    onChange(tariffs.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  return (
    <div className="space-y-3">
      {tariffs.map((t, idx) => {
        const scope = t.mediaScope ?? 'both'
        const showImages = scope !== 'video'
        const showVideo = scope !== 'images'
        return (
          <div
            key={t.id}
            className="rounded-lg border border-line bg-paper/50 p-3 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">Тариф {idx + 1}</span>
              <button
                type="button"
                disabled={tariffs.length <= 1}
                className="text-xs text-bad hover:underline disabled:opacity-40"
                onClick={() => onChange(tariffs.filter((x) => x.id !== t.id))}
              >
                Удалить
              </button>
            </div>
            <div className="rounded-lg border border-line bg-card/60 px-3 py-2 space-y-2">
              <div className="text-xs text-muted">В тарифный план входит</div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={scope === 'both'}
                  onChange={(e) => {
                    const mediaScope: TariffMediaScope = e.target.checked
                      ? 'both'
                      : scope === 'video'
                        ? 'video'
                        : 'images'
                    update(t.id, { mediaScope })
                  }}
                />
                Суммарно картинки + видео
              </label>
              {scope !== 'both' && (
                <div className="flex flex-wrap gap-4 text-sm pl-6">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`media-scope-${t.id}`}
                      checked={scope === 'images'}
                      onChange={() => update(t.id, { mediaScope: 'images' })}
                    />
                    Только картинки
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`media-scope-${t.id}`}
                      checked={scope === 'video'}
                      onChange={() => update(t.id, { mediaScope: 'video' })}
                    />
                    Только видео
                  </label>
                </div>
              )}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <Field label="Название">
                <input
                  className={inputCls}
                  value={t.name}
                  onChange={(e) => update(t.id, { name: e.target.value })}
                />
              </Field>
              <Field label="Цена, ₽ / мес">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={t.priceRub}
                  onChange={(e) => update(t.id, { priceRub: parseNum(e.target.value) })}
                />
              </Field>
              <Field label="Доля продаж, %">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={pctInput(t.share)}
                  onChange={(e) => update(t.id, { share: parsePct(e.target.value) })}
                />
              </Field>
              {showVideo && (
                <Field label="Длительность видео, сек">
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    value={t.videoSeconds}
                    onChange={(e) => update(t.id, { videoSeconds: parseNum(e.target.value) })}
                  />
                </Field>
              )}
              {showImages && (
                <Field label="Изображений / мес">
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={t.imagesPerMonth}
                    onChange={(e) => update(t.id, { imagesPerMonth: parseNum(e.target.value) })}
                  />
                </Field>
              )}
              {showVideo && (
                <Field label="Видео / мес">
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={t.videosPerMonth}
                    onChange={(e) => update(t.id, { videosPerMonth: parseNum(e.target.value) })}
                  />
                </Field>
              )}
              {showImages && (
                <Field label="Макс. image-модель (для COGS)">
                  <ModelSelect
                    kind="image"
                    table={table}
                    value={t.maxImage}
                    onChange={(maxImage) => update(t.id, { maxImage })}
                  />
                </Field>
              )}
              {showVideo && (
                <Field label="Макс. video-модель (для COGS)">
                  <ModelSelect
                    kind="video"
                    table={table}
                    value={t.maxVideo}
                    onChange={(maxVideo) => update(t.id, { maxVideo })}
                  />
                </Field>
              )}
            </div>
          </div>
        )
      })}
      <button
        type="button"
        className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-paper"
        onClick={() =>
          onChange([
            ...tariffs,
            createTariff({
              name: `Тариф ${tariffs.length + 1}`,
              share: 0.1,
              priceRub: 990,
            }),
          ])
        }
      >
        Добавить тариф
      </button>
    </div>
  )
}

export function SalesPlanPage() {
  const { user, loading } = useAuth()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [name, setName] = useState('Базовый сценарий')
  const [draft, setDraft] = useState<SalesPlanPayload>(() => defaultPayload())
  const [savedSnapshot, setSavedSnapshot] = useState<{
    name: string
    payload: SalesPlanPayload
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const scenarios = useQuery({
    queryKey: ['sales-scenarios'],
    queryFn: salesPlanApi.list,
    enabled: !!user,
  })

  useEffect(() => {
    if (!scenarios.data || scenarios.data.length === 0) return
    if (selectedId != null && scenarios.data.some((s) => s.id === selectedId)) return
    const first = scenarios.data[0]
    setSelectedId(first.id)
    const payload = coercePayload(first.payload)
    setName(first.name)
    setDraft(payload)
    setSavedSnapshot({ name: first.name, payload: deepClonePayload(payload) })
  }, [scenarios.data, selectedId])

  const dirty = useMemo(() => {
    if (!savedSnapshot) return true
    return name.trim() !== savedSnapshot.name || !payloadsEqual(draft, savedSnapshot.payload)
  }, [name, draft, savedSnapshot])

  const result = useMemo(() => computeSalesPlan(draft), [draft])

  const onError = (e: Error) => setError(e instanceof ApiError ? e.detail : e.message)

  const applyScenario = (s: SalesPlanScenario) => {
    const payload = coercePayload(s.payload)
    setSelectedId(s.id)
    setName(s.name)
    setDraft(payload)
    setSavedSnapshot({ name: s.name, payload: deepClonePayload(payload) })
    setError(null)
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), payload: draft as unknown as Record<string, unknown> }
      if (selectedId == null) return salesPlanApi.create(body)
      return salesPlanApi.update(selectedId, body)
    },
    onSuccess: (row) => {
      setError(null)
      const payload = coercePayload(row.payload)
      setSelectedId(row.id)
      setName(row.name)
      setDraft(payload)
      setSavedSnapshot({ name: row.name, payload: deepClonePayload(payload) })
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
      void qc.invalidateQueries({ queryKey: ['sales-scenarios'] })
    },
    onError,
  })

  const createBlank = useMutation({
    mutationFn: async () => {
      const base = defaultPayload()
      const existing = new Set((scenarios.data ?? []).map((s) => s.name))
      let n = 1
      let candidate = `Сценарий ${n}`
      while (existing.has(candidate)) {
        n += 1
        candidate = `Сценарий ${n}`
      }
      return salesPlanApi.create({
        name: candidate,
        payload: base as unknown as Record<string, unknown>,
      })
    },
    onSuccess: (row) => {
      setError(null)
      applyScenario(row)
      void qc.invalidateQueries({ queryKey: ['sales-scenarios'] })
    },
    onError,
  })

  const duplicate = useMutation({
    mutationFn: async () => {
      const existing = new Set((scenarios.data ?? []).map((s) => s.name))
      let candidate = `${name.trim() || 'Сценарий'} (копия)`
      let n = 2
      while (existing.has(candidate)) {
        candidate = `${name.trim() || 'Сценарий'} (копия ${n})`
        n += 1
      }
      return salesPlanApi.create({
        name: candidate,
        payload: draft as unknown as Record<string, unknown>,
      })
    },
    onSuccess: (row) => {
      setError(null)
      applyScenario(row)
      void qc.invalidateQueries({ queryKey: ['sales-scenarios'] })
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: number) => salesPlanApi.remove(id),
    onSuccess: () => {
      setError(null)
      setSelectedId(null)
      setSavedSnapshot(null)
      setName('Базовый сценарий')
      setDraft(defaultPayload())
      void qc.invalidateQueries({ queryKey: ['sales-scenarios'] })
    },
    onError,
  })

  const patch = <K extends keyof SalesPlanPayload>(key: K, value: SalesPlanPayload[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const shareWarn =
    result.shareSum > 0 && Math.abs(result.shareSum - 1) > 0.001
      ? `Сумма долей ${formatPct(result.shareSum, 1)} — нормализуем к 100% при расчёте`
      : null

  if (loading) {
    return <div className="text-sm text-muted">Загрузка…</div>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Экономика продаж</h1>
        <p className="text-sm text-muted mt-0.5">
          Unit-экономика воронки: несколько тарифов с долями, free tier с доступными моделями,
          реферальный %. ARPPU и COGS считаются по тарифам (макс. модель тарифа).
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-bad/10 text-bad text-sm px-4 py-3">{error}</div>
      )}

      <Section title="Сценарии" description="Сохраняются в БД; можно держать несколько вариантов.">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <Field label="Выбранный сценарий">
              <select
                className={selectCls}
                value={selectedId ?? ''}
                onChange={(e) => {
                  const id = Number(e.target.value)
                  const s = scenarios.data?.find((x) => x.id === id)
                  if (s) {
                    if (dirty && !window.confirm('Есть несохранённые изменения. Переключить?')) {
                      return
                    }
                    applyScenario(s)
                  }
                }}
              >
                {(scenarios.data ?? []).length === 0 && (
                  <option value="">Нет сохранённых сценариев</option>
                )}
                {(scenarios.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="min-w-[12rem] flex-1">
            <Field label="Название">
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <button
            type="button"
            disabled={save.isPending || !name.trim() || !dirty}
            onClick={() => save.mutate()}
            className="rounded-lg bg-accent hover:bg-accent-hover text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {savedFlash ? 'Сохранено' : save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button
            type="button"
            disabled={createBlank.isPending}
            onClick={() => {
              if (dirty && !window.confirm('Есть несохранённые изменения. Создать новый?')) return
              createBlank.mutate()
            }}
            className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-paper"
          >
            Новый
          </button>
          <button
            type="button"
            disabled={duplicate.isPending}
            onClick={() => duplicate.mutate()}
            className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-paper"
          >
            Дублировать
          </button>
          <button
            type="button"
            disabled={selectedId == null || remove.isPending}
            onClick={() => {
              if (selectedId == null) return
              if (!window.confirm('Удалить сценарий?')) return
              remove.mutate(selectedId)
            }}
            className="rounded-lg border border-bad/40 text-bad px-3 py-2 text-sm hover:bg-bad/10 disabled:opacity-50"
          >
            Удалить
          </button>
        </div>
        {dirty && <p className="text-xs text-muted">Есть несохранённые изменения.</p>}
      </Section>

      <Section
        title="Финансовый результат"
        description="Пересчитывается при каждом изменении полей сценария."
      >
        <dl className="grid sm:grid-cols-3 gap-3 rounded-lg border border-line bg-paper/40 px-3 py-2.5 text-xs">
          <div>
            <dt className="font-semibold text-ink">ARPPU</dt>
            <dd className="text-muted mt-0.5">
              Average Revenue Per Paying User — средний чек платящего пользователя в месяц.
              Здесь: средневзвешенная цена тарифов по их долям в продажах.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">COGS</dt>
            <dd className="text-muted mt-0.5">
              Cost of Goods Sold — себестоимость «товара» (генераций): расходы на модели
              провайдеров для free tier и платных пользователей.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">P&amp;L</dt>
            <dd className="text-muted mt-0.5">
              Profit &amp; Loss — отчёт о прибылях и убытках: выручка минус COGS и реферальные
              выплаты; показывает, сходится ли экономика сценария.
            </dd>
          </div>
        </dl>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ResultCard
            label="ARPPU"
            value={`${formatMoney(result.arppuRub, 0)} ₽`}
            hint="Средний чек по миксу тарифов"
          />
          <ResultCard
            label="Платящие"
            value={formatMoney(result.paying, 0)}
            hint={`${formatPct(draft.funnel.cPay)} от активированных`}
          />
          <ResultCard label="Выручка" value={`${formatMoney(result.revenueRub, 0)} ₽`} />
          <ResultCard
            label="Прибыль"
            value={`${formatMoney(result.profitRub, 0)} ₽`}
            tone={result.profitRub >= 0 ? 'good' : 'bad'}
            hint={
              result.marginPct == null
                ? undefined
                : `Маржа ${formatMoney(result.marginPct, 1)}%`
            }
          />
          <ResultCard
            label="COGS free tier"
            value={`${formatMoney(result.freeCogsRub, 0)} ₽`}
            hint={`max image ${result.freeImageCostUsd.toFixed(4)}$ · util ${formatPct(draft.freeTier.utilization)}`}
          />
          <ResultCard
            label="COGS платных"
            value={`${formatMoney(result.paidCogsRub, 0)} ₽`}
            hint={`ср. unit ${formatMoney(result.paidUnitCostRub, 2)} ₽`}
          />
          <ResultCard
            label="Реф. выплаты"
            value={`${formatMoney(result.referralPayoutRub, 0)} ₽`}
            hint={`${formatPct(draft.referral.percent)} × ${formatPct(draft.referral.shareOfPaying)} платящих`}
          />
          <ResultCard
            label="Break-even в оплату"
            value={
              result.breakEvenCPay == null
                ? '—'
                : formatPct(Math.max(0, result.breakEvenCPay), 1)
            }
            hint={
              result.breakEvenCPay == null
                ? 'Нет положительного вклада платящего'
                : result.breakEvenCPay > 1
                  ? 'Выше 100% — сценарий не сходится'
                  : 'Минимум среди активированных'
            }
            tone={
              result.breakEvenCPay != null && result.breakEvenCPay <= draft.funnel.cPay
                ? 'good'
                : 'neutral'
            }
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-4 pt-2">
          <div className="rounded-lg border border-line bg-paper/40 p-3">
            <h3 className="text-xs font-medium text-muted mb-2">Воронка</h3>
            <FunnelChart visitors={draft.funnel.visitors} result={result} />
          </div>
          <div className="rounded-lg border border-line bg-paper/40 p-3">
            <h3 className="text-xs font-medium text-muted mb-2">P&amp;L и free tier</h3>
            <StackedCostChart result={result} />
          </div>
          <div className="rounded-lg border border-line bg-paper/40 p-3">
            <h3 className="text-xs font-medium text-muted mb-2">Микс тарифов</h3>
            <TariffMixChart result={result} />
          </div>
        </div>

        {result.tariffs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-1.5 pr-2 font-medium">Тариф</th>
                  <th className="py-1.5 px-1 font-medium">Состав</th>
                  <th className="py-1.5 px-1 font-medium">Доля</th>
                  <th className="py-1.5 px-1 font-medium">Цена</th>
                  <th className="py-1.5 px-1 font-medium">Unit COGS</th>
                  <th className="py-1.5 px-1 font-medium">Платящих</th>
                  <th className="py-1.5 px-1 font-medium">Выручка</th>
                  <th className="py-1.5 pl-1 font-medium">COGS</th>
                </tr>
              </thead>
              <tbody>
                {result.tariffs.map((t) => (
                  <tr key={t.id} className="border-b border-line/50">
                    <td className="py-1.5 pr-2">{t.name}</td>
                    <td className="py-1.5 px-1 text-muted">
                      {t.mediaScope === 'images'
                        ? 'картинки'
                        : t.mediaScope === 'video'
                          ? 'видео'
                          : 'картинки+видео'}
                    </td>
                    <td className="py-1.5 px-1 tabular-nums">{formatPct(t.share)}</td>
                    <td className="py-1.5 px-1 tabular-nums">{formatMoney(t.priceRub, 0)} ₽</td>
                    <td className="py-1.5 px-1 tabular-nums">
                      {formatMoney(t.unitCostRub, 2)} ₽
                    </td>
                    <td className="py-1.5 px-1 tabular-nums">{formatMoney(t.paying, 0)}</td>
                    <td className="py-1.5 px-1 tabular-nums">
                      {formatMoney(t.revenueRub, 0)} ₽
                    </td>
                    <td className="py-1.5 pl-1 tabular-nums">
                      {formatMoney(t.cogsRub, 0)} ₽
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section
          title="Воронка"
          description="Посетители → регистрация → активация → оплата. Курс для перевода USD-себестоимости в рубли."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Посетители / мес">
              <input
                className={inputCls}
                inputMode="numeric"
                value={draft.funnel.visitors}
                onChange={(e) =>
                  patch('funnel', { ...draft.funnel, visitors: parseNum(e.target.value) })
                }
              />
            </Field>
            <Field label="Курс USD → RUB">
              <input
                className={inputCls}
                inputMode="decimal"
                value={draft.currencyRate}
                onChange={(e) => patch('currencyRate', parseNum(e.target.value))}
              />
            </Field>
            <Field label="Конверсия в регистрацию, %">
              <input
                className={inputCls}
                inputMode="decimal"
                value={pctInput(draft.funnel.cReg)}
                onChange={(e) =>
                  patch('funnel', { ...draft.funnel, cReg: parsePct(e.target.value) })
                }
              />
            </Field>
            <Field label="Конверсия в активацию, %">
              <input
                className={inputCls}
                inputMode="decimal"
                value={pctInput(draft.funnel.cAct)}
                onChange={(e) =>
                  patch('funnel', { ...draft.funnel, cAct: parsePct(e.target.value) })
                }
              />
            </Field>
            <Field label="Конверсия в оплату, %">
              <input
                className={inputCls}
                inputMode="decimal"
                value={pctInput(draft.funnel.cPay)}
                onChange={(e) =>
                  patch('funnel', { ...draft.funnel, cPay: parsePct(e.target.value) })
                }
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Реферальная программа"
          description="Вознаграждение — процент от платежей приведённого пользователя."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Вознаграждение, % от платежей">
              <input
                className={inputCls}
                inputMode="decimal"
                value={pctInput(draft.referral.percent)}
                onChange={(e) =>
                  patch('referral', {
                    ...draft.referral,
                    percent: parsePct(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Доля платящих по рефералке, %">
              <input
                className={inputCls}
                inputMode="decimal"
                value={pctInput(draft.referral.shareOfPaying)}
                onChange={(e) =>
                  patch('referral', {
                    ...draft.referral,
                    shareOfPaying: parsePct(e.target.value),
                  })
                }
              />
            </Field>
          </div>
        </Section>
      </div>

      <Section
        title="Платные тарифы"
        description="Доля в продажах (нормализуется), цена → ARPPU. COGS — от max-модели и квоты; чекбокс «картинки + видео» или только один тип медиа."
      >
        {shareWarn && <p className="text-xs text-accent">{shareWarn}</p>}
        <TariffsEditor
          tariffs={draft.tariffs}
          table={draft.priceTable}
          onChange={(tariffs) => patch('tariffs', tariffs)}
        />
      </Section>

      <Section
        title="Бесплатный тариф"
        description="Квота и доступные модели для тестирования. Себестоимость — по самой дорогой из выбранных (worst-case)."
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Изображений / мес">
            <input
              className={inputCls}
              inputMode="numeric"
              value={draft.freeTier.imagesPerMonth}
              onChange={(e) =>
                patch('freeTier', {
                  ...draft.freeTier,
                  imagesPerMonth: parseNum(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Видео / мес">
            <input
              className={inputCls}
              inputMode="numeric"
              value={draft.freeTier.videosPerMonth}
              onChange={(e) =>
                patch('freeTier', {
                  ...draft.freeTier,
                  videosPerMonth: parseNum(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Длительность видео, сек">
            <input
              className={inputCls}
              inputMode="decimal"
              value={draft.freeTier.videoSeconds}
              onChange={(e) =>
                patch('freeTier', {
                  ...draft.freeTier,
                  videoSeconds: parseNum(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Utilization, %">
            <input
              className={inputCls}
              inputMode="decimal"
              value={pctInput(draft.freeTier.utilization)}
              onChange={(e) =>
                patch('freeTier', {
                  ...draft.freeTier,
                  utilization: parsePct(e.target.value),
                })
              }
            />
          </Field>
        </div>
        <div className="grid md:grid-cols-2 gap-3 pt-1">
          <div>
            <div className={labelCls}>
              Image-модели free ({draft.freeTier.imageModels.length}) · max{' '}
              {result.freeImageCostUsd.toFixed(4)} $
            </div>
            <ModelMultiSelect
              kind="image"
              table={draft.priceTable}
              value={draft.freeTier.imageModels}
              onChange={(imageModels) =>
                patch('freeTier', { ...draft.freeTier, imageModels })
              }
            />
          </div>
          <div>
            <div className={labelCls}>
              Video-модели free ({draft.freeTier.videoModels.length}) · max{' '}
              {result.freeVideoSecCostUsd.toFixed(4)} $/с
            </div>
            <ModelMultiSelect
              kind="video"
              table={draft.priceTable}
              value={draft.freeTier.videoModels}
              onChange={(videoModels) =>
                patch('freeTier', { ...draft.freeTier, videoModels })
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted">
          Free unit cost: {formatMoney(result.freeUnitCostRub, 2)} ₽ / активный пользователь
        </p>
      </Section>

      <Section
        title="Справочник цен моделей"
        description="Дефолты из «Цены моделей по провайдерам.ods». Диапазоны предзаполнены средним. Правки хранятся в сценарии."
      >
        <PriceTableEditor
          rows={draft.priceTable}
          onChange={(priceTable) => patch('priceTable', priceTable)}
        />
      </Section>
    </div>
  )
}
