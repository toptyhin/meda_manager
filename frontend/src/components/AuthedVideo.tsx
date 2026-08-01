import { useEffect, useState } from 'react'
import { fetchAuthedBlob } from '../api/client'

type Props = {
  src: string
  className?: string
  controls?: boolean
}

export function AuthedVideo({ src, className, controls = true }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    void fetchAuthedBlob(src)
      .then((u) => {
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
    return <div className={`bg-line/60 animate-pulse ${className ?? ''}`} aria-hidden />
  }
  return (
    <video
      src={url}
      controls={controls}
      preload="metadata"
      playsInline
      className={className}
    />
  )
}
