import { Link } from 'react-router-dom'
import { AuthedImage } from '../AuthedImage'
import type { Generation, GenerationStep } from '../../types'

function actionLabel(action: string): string {
  if (action === 'fix_i2i') return 'правка (i2i)'
  if (action === 'fix_regen') return 'регенерация'
  return 'генерация'
}

function stepStatusLabel(step: GenerationStep, isLatest: boolean, jobRunning: boolean): string {
  if (step.error && !step.image_id) return 'ошибка генерации'
  if (step.image_id && step.review_score == null && !step.finished_at && jobRunning && isLatest) {
    return 'проверка качества…'
  }
  if (step.image_id && step.review_score == null && step.error?.startsWith('review failed')) {
    return 'ревью недоступно'
  }
  if (step.review_score != null) {
    return step.review_passed ? 'принято' : 'нужна правка'
  }
  if (!step.image_id && jobRunning && isLatest) return 'генерация…'
  return 'готово'
}

export function JobStatusCard({ job }: { job: Generation }) {
  const jobRunning = job.status === 'pending' || job.status === 'running'
  const steps = job.steps ?? []

  return (
    <div className="rounded-xl border border-line bg-card p-4 space-y-3">
      <div className="flex items-center justify-between text-sm gap-3 flex-wrap">
        <span>
          Задача #{job.id}:{' '}
          <strong>
            {job.status === 'pending' && 'в очереди'}
            {job.status === 'running' &&
              (job.auto_review ? 'автопайплайн…' : 'генерация…')}
            {job.status === 'done' && 'готово'}
            {job.status === 'error' && 'ошибка'}
          </strong>
        </span>
        {jobRunning && (
          <span className="text-muted animate-pulse">
            {job.auto_review
              ? 'авто-режим: до нескольких минут × число попыток'
              : 'ожидайте до нескольких минут'}
          </span>
        )}
        {job.status === 'done' && job.auto_review && (
          <span
            className={`text-xs font-medium rounded-full px-2 py-0.5 ${
              job.review_passed ? 'bg-accent/15 text-accent' : 'bg-bad/10 text-bad'
            }`}
          >
            {job.review_score != null ? `оценка ${job.review_score}/10` : 'без оценки'}
            {job.review_passed === false && ' · качество не подтверждено'}
            {job.review_passed === true && ' · принято'}
          </span>
        )}
      </div>
      {job.error && <div className="text-bad text-sm">{job.error}</div>}

      {job.auto_review && steps.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted uppercase tracking-wide">
            Попытки
          </div>
          <ol className="space-y-2">
            {steps.map((step, idx) => {
              const isLatest = idx === steps.length - 1
              return (
                <li
                  key={step.id}
                  className="flex gap-3 items-start rounded-lg border border-line bg-paper/60 p-2"
                >
                  {step.thumb_url ? (
                    <AuthedImage
                      src={step.thumb_url}
                      alt={`attempt-${step.attempt}`}
                      className="w-14 h-14 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded bg-line/40 shrink-0 animate-pulse" />
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium">
                        Попытка {step.attempt} · {actionLabel(step.action)}
                      </span>
                      <span className="text-muted">
                        {stepStatusLabel(step, isLatest, jobRunning)}
                      </span>
                      {step.review_score != null && (
                        <span className="text-xs rounded bg-card border border-line px-1.5">
                          {step.review_score}/10
                        </span>
                      )}
                      {step.review_fix_mode && step.review_passed === false && (
                        <span className="text-xs text-muted">
                          → {step.review_fix_mode === 'regen' ? 'regen' : 'i2i'}
                        </span>
                      )}
                    </div>
                    {step.review_issues?.length > 0 && (
                      <ul className="mt-1 text-xs text-muted list-disc pl-4 space-y-0.5">
                        {step.review_issues.map((issue, i) => (
                          <li key={i}>
                            <span
                              className={
                                issue.severity === 'major' ? 'text-bad' : undefined
                              }
                            >
                              {issue.description || issue.type}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {step.error && (
                      <div className="mt-1 text-xs text-bad">{step.error}</div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {job.status === 'done' && job.result_image_id && (
        <div className="space-y-2">
          <AuthedImage
            src={`/api/images/${job.result_image_id}/file`}
            alt="result"
            className="max-h-96 rounded-lg object-contain mx-auto"
          />
          <Link to="/" className="text-sm text-accent hover:underline inline-block">
            Открыть в медиа-менеджере →
          </Link>
        </div>
      )}
    </div>
  )
}
