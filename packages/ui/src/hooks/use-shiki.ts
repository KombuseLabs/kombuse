import { useState, useEffect, useCallback, useRef } from 'react'
import type { Highlighter } from 'shiki'

let highlighterPromise: Promise<Highlighter> | null = null
let highlighterInstance: Highlighter | null = null

const PRELOAD_LANGUAGES = [
  'typescript', 'javascript', 'tsx', 'jsx',
  'python', 'bash', 'json', 'html', 'css',
  'go', 'rust', 'yaml', 'sql', 'markdown', 'diff',
] as const

async function loadHighlighter(): Promise<Highlighter> {
  if (highlighterInstance) return highlighterInstance
  if (highlighterPromise) return highlighterPromise

  highlighterPromise = (async () => {
    const { createHighlighter } = await import('shiki')
    const h = await createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [...PRELOAD_LANGUAGES],
    })
    highlighterInstance = h
    return h
  })()

  return highlighterPromise
}

export function useShiki() {
  const [ready, setReady] = useState(!!highlighterInstance)
  const highlighterRef = useRef<Highlighter | null>(highlighterInstance)

  useEffect(() => {
    if (highlighterInstance) {
      highlighterRef.current = highlighterInstance
      setReady(true)
      return
    }

    let mounted = true
    loadHighlighter()
      .then((h) => {
        if (mounted) {
          highlighterRef.current = h
          setReady(true)
        }
      })
      .catch(console.error)

    return () => { mounted = false }
  }, [])

  const highlight = useCallback((code: string, lang: string): string | null => {
    const h = highlighterRef.current
    if (!h) return null

    try {
      const loadedLangs = new Set(h.getLoadedLanguages())
      return h.codeToHtml(code, {
        lang: loadedLangs.has(lang) ? lang : 'text',
        themes: { light: 'github-light', dark: 'github-dark' },
        defaultColor: 'light',
      })
    } catch (e) {
      console.warn('Shiki highlight error:', e)
      return null
    }
  }, [])

  return { ready, highlight }
}
