/** Strip `{subject}` placeholder and tidy whitespace for prompt insertion. */
export function snippetOf(text: string): string {
  return text
    .replace(/\s+of\s+\{subject\}/gi, '')
    .replace(/\{subject\}/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim()
}

/** Append phrase with comma separator; skip if already present (case-insensitive). */
export function insertSnippet(text: string, phrase: string): string {
  const t = text.trim()
  const p = phrase.trim()
  if (!p) return t
  if (t.toLowerCase().includes(p.toLowerCase())) return t
  return t ? `${t}, ${p}` : p
}

/** Remove first occurrence of snippet and clean up separators. */
export function removeSnippet(text: string, snippet: string): string {
  const s = snippet.trim()
  if (!s) return text
  const lower = text.toLowerCase()
  const idx = lower.indexOf(s.toLowerCase())
  if (idx < 0) return text
  const before = text.slice(0, idx)
  const after = text.slice(idx + s.length)
  return `${before}${after}`
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim()
}
