const namedEntities: Record<string, string> = {
  amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"', zwnj: '', zwj: '', lrm: '', rlm: ''
}

export const decodeMailText = (value: string): string => value
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== '#') return namedEntities[code.toLowerCase()] ?? entity
    const numeric = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10)
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity
  })
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
