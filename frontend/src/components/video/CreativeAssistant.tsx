import { PLATFORM_PRESETS, type PromptParts } from '../../lib/videoPresets'
import { useVideoFormStore } from '../../lib/videoFormStore'

const PART_FIELDS: Array<[keyof PromptParts, string]> = [
  ['subject', 'Субъект'],
  ['action', 'Действие'],
  ['scene', 'Сцена'],
  ['camera', 'Движение камеры'],
  ['lighting', 'Освещение'],
  ['style', 'Стиль'],
]

export function CreativeAssistant() {
  const showAssistant = useVideoFormStore((s) => s.showAssistant)
  const parts = useVideoFormStore((s) => s.parts)
  const toggleAssistant = useVideoFormStore((s) => s.toggleAssistant)
  const setPart = useVideoFormStore((s) => s.setPart)
  const applyPlatform = useVideoFormStore((s) => s.applyPlatform)
  const applyPartsToPrompt = useVideoFormStore((s) => s.applyPartsToPrompt)

  return (
    <div className="rounded-xl border border-line bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-medium text-sm">Креативный ассистент</div>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORM_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPlatform(p.id)}
              className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-line/40"
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={toggleAssistant}
            className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-line/40"
          >
            {showAssistant ? 'Скрыть шаблон' : 'Шаблон промпта'}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">
        Шаблон: [Субъект] + [Действие] + [Сцена] + [Движение камеры] + [Освещение] +
        [Стиль]
      </p>
      {showAssistant && (
        <div className="grid sm:grid-cols-2 gap-2">
          {PART_FIELDS.map(([key, label]) => (
            <label key={key} className="text-xs block">
              <span className="text-muted">{label}</span>
              <input
                className="mt-0.5 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
                value={parts[key]}
                onChange={(e) => setPart(key, e.target.value)}
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={applyPartsToPrompt}
              className="rounded-md bg-ink text-paper px-3 py-1.5 text-xs"
            >
              Собрать промпт из шаблона
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
