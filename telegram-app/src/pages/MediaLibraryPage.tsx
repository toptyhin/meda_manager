export function MediaLibraryPage() {
  return (
    <div className="flex flex-col items-center text-center pt-16 anim-fade-up">
      <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
        </svg>
      </div>
      <h1 className="mt-4 text-xl font-bold tracking-tight">Медиатека</h1>
      <p className="mt-2 max-w-64 text-sm text-muted leading-relaxed">
        Сетка ваших изображений и видео с фильтрами и оценками — в разработке.
      </p>
    </div>
  )
}
