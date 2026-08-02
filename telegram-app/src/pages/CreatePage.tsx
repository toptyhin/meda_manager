export function CreatePage() {
  return (
    <div className="flex flex-col items-center text-center pt-16 anim-fade-up">
      <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-grad-from via-grad-via to-grad-to text-white shadow-lg">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <h1 className="mt-4 text-xl font-bold tracking-tight">Создать</h1>
      <p className="mt-2 max-w-64 text-sm text-muted leading-relaxed">
        Мастер генерации изображений и видео появится здесь на следующем шаге.
      </p>
    </div>
  )
}
