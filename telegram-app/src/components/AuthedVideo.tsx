import { useEffect, useState } from 'react'
import { fetchAuthedBlob } from '../api/client'

type Props = {
  src: string
  className?: string
  controls?: boolean
  autoPlay?: boolean
}

/** <video> для JWT-эндпоинтов (/api/videos/{id}/file): тянет blob и показывает object URL. */
export function AuthedVideo({ src, className, controls = true, autoPlay = false }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    void fetchAuthedBlob(src)
      .then((blob) => {
        const u = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(u)
          return
        }
        objectUrl = u
        setUrl(u)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  if (!url) {
    return <div className={`skeleton ${className ?? ''}`} aria-hidden />
  }
  return (
    <video
      src={url}
      controls={controls}
      autoPlay={autoPlay}
      preload="metadata"
      playsInline
      className={className}
    />
  )
}
