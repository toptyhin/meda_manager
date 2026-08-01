import { VideoGenerator } from '../components/video/VideoGenerator'
import { VideoLibrary } from '../components/video/VideoLibrary'

export function VideoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Видео</h1>
        <p className="text-sm text-muted mt-1">
          Agnes Video V2.0 · Оживлятор · Режиссёр · Сторимейкер
        </p>
      </div>
      <VideoGenerator />
      <VideoLibrary />
    </div>
  )
}
