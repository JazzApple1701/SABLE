export interface EmailDocumentPrivacy { loadRemoteImages: boolean; blockTrackers: boolean; cleanLinks: boolean }
const cleanTrackingLinks = (html: string): string => html.replace(/href=(['"])(https?:\/\/[^'"]+)\1/gi, (_match, quote: string, href: string) => {
  try { const url = new URL(href.replace(/&amp;/g, '&')); for (const key of [...url.searchParams.keys()]) if (/^(utm_|gclid$|fbclid$|mc_[ce]id$|mkt_tok$)/i.test(key)) url.searchParams.delete(key); return `href=${quote}${url.toString().replace(/&/g, '&amp;')}${quote} rel=${quote}noopener noreferrer${quote}` } catch { return `href=${quote}${href}${quote}` }
})
const removeTrackingPixels = (html: string): string => html.replace(/<img\b[^>]*>/gi, tag => {
  const tiny = /(?:width|height)\s*=\s*['"]?0?1(?:px)?['"]?/i.test(tag) || /style\s*=\s*['"][^'"]*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(tag)
  const tracker = /src\s*=\s*['"][^'"]*(?:\/open(?:[?/.]|$)|\/pixel(?:[?/.]|$)|\/beacon(?:[?/.]|$)|email[_-]?track)/i.test(tag)
  return tiny || tracker ? '<span data-sable-tracker-blocked hidden></span>' : tag
})
export const buildEmailDocument = (html: string, privacy: boolean | EmailDocumentPrivacy = true): string => {
  const options = typeof privacy === 'boolean' ? { loadRemoteImages: privacy, blockTrackers: true, cleanLinks: true } : privacy
  const loadRemoteImages = options.loadRemoteImages
  const imageSources = loadRemoteImages ? 'data: blob: https:' : 'data: blob:'
  const head = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imageSources}; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><base target="_blank"><style>html{color-scheme:light;background:#fff;overflow:hidden}body{margin:0;padding:20px;overflow:hidden;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style>`
  let safeHtml = html.replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '').replace(/<base\b[^>]*>/gi, '')
  if (options.blockTrackers) safeHtml = removeTrackingPixels(safeHtml)
  if (options.cleanLinks) safeHtml = cleanTrackingLinks(safeHtml)
  if (/<head[\s>]/i.test(safeHtml)) return safeHtml.replace(/<head([^>]*)>/i, `<head$1>${head}`)
  return `<!doctype html><html><head>${head}</head><body>${safeHtml}</body></html>`
}
