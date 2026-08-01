import { useEffect, useState } from 'react'
import { fetchAuthedBlob } from '../api/client'

type Props = {
  src: string
  alt: string
  className?: string
}

export function AuthedImage({ src, alt, className }: Props) {
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
    return <div className={`bg-line/60 animate-pulse ${className ?? ''}`} aria-hidden />
  }
  return <img src={url} alt={alt} className={className} />
}
