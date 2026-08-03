import { api } from './client'

export type UploadedImage = {
  id: number
  kind: string
  width: number
  height: number
  thumb_url: string
  file_url: string
}

export const imagesApi = {
  upload: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api<UploadedImage>('/api/images/upload', { method: 'POST', formData: fd })
  },
}
