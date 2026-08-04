type Props = {
  value: number
  onChange?: (v: number) => void
  size?: 'sm' | 'md'
}

export function Stars({ value, onChange, size = 'md' }: Props) {
  const cls = size === 'sm' ? 'text-sm' : 'text-lg'
  return (
    <div className={`inline-flex gap-0.5 ${cls}`} role="radiogroup" aria-label="Оценка">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} из 5`}
          disabled={!onChange}
          className={`leading-none ${
            n <= value ? 'text-accent' : 'text-line'
          } ${onChange ? 'hover:text-accent cursor-pointer' : 'cursor-default'}`}
          onClick={() => onChange?.(n === value ? 0 : n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}
