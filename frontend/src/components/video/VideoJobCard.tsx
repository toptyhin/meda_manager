import { AuthedVideo } from '../AuthedVideo'
import { MODE_LABELS } from '../../lib/videoPresets'
import type { VideoGeneration } from '../../types'

export function VideoJobCard({ job }: { job: VideoGeneration }) {
  const jobRunning = job.status === 'pending' || job.status === 'running'
  const resultUrl =
    job.status === 'done' && job.result_video_id
      ? `/api/videos/${job.result_video_id}/file`
      : null

  return (
    <div className="rounded-xl border border-line bg-card p-4 space-y-3">
      <div className="flex items-center justify-between text-sm gap-3 flex-wrap">
        <span>
          Задача #{job.id} · {MODE_LABELS[job.mode]}:{' '}
          <strong>
            {job.status === 'pending' && 'в очереди'}
            {job.status === 'running' && 'генерация…'}
            {job.status === 'done' && 'готово'}
            {job.status === 'error' && 'ошибка'}
          </strong>
        </span>
        {jobRunning && <span className="text-muted">{job.progress}%</span>}
      </div>
      {jobRunning && (
        <div className="h-2 rounded-full bg-line overflow-hidden">
          <div
            className="h-full bg-accent transition-[width] duration-500"
            style={{ width: `${Math.max(job.progress, 4)}%` }}
          />
        </div>
      )}
      {job.error && <div className="text-bad text-sm">{job.error}</div>}
      {resultUrl && (
        <AuthedVideo
          src={resultUrl}
          className="w-full max-h-[480px] rounded-lg bg-ink/5"
        />
      )}
    </div>
  )
}
