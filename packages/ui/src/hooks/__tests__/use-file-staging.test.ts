import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileStaging, formatFileSize, ALLOWED_TYPES, MAX_SIZE } from '../use-file-staging'

// Mock URL.createObjectURL / revokeObjectURL
let objectUrlCounter = 0
const revokedUrls = new Set<string>()

beforeEach(() => {
  objectUrlCounter = 0
  revokedUrls.clear()
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => `blob:mock-${++objectUrlCounter}`),
    revokeObjectURL: vi.fn((url: string) => revokedUrls.add(url)),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function createFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size)
  return new File([buffer], name, { type })
}

// --- formatFileSize ---

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1024 * 1023)).toBe('1023.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatFileSize(5.5 * 1024 * 1024)).toBe('5.5 MB')
  })
})

// --- useFileStaging ---

describe('useFileStaging', () => {
  it('returns empty initial state', () => {
    const { result } = renderHook(() => useFileStaging())
    expect(result.current.stagedFiles).toEqual([])
    expect(result.current.previewUrls).toEqual([])
    expect(result.current.isDragOver).toBe(false)
    expect(result.current.hasFiles).toBe(false)
  })

  describe('addFiles', () => {
    it('accepts valid image files', () => {
      const { result } = renderHook(() => useFileStaging())
      const file = createFile('photo.png', 1024, 'image/png')

      act(() => result.current.addFiles([file]))

      expect(result.current.stagedFiles).toHaveLength(1)
      expect(result.current.stagedFiles[0]?.name).toBe('photo.png')
      expect(result.current.previewUrls).toHaveLength(1)
      expect(result.current.hasFiles).toBe(true)
    })

    it('rejects files with invalid types', () => {
      const { result } = renderHook(() => useFileStaging())
      const file = createFile('doc.pdf', 1024, 'application/pdf')

      act(() => result.current.addFiles([file]))

      expect(result.current.stagedFiles).toHaveLength(0)
      expect(result.current.hasFiles).toBe(false)
    })

    it('rejects files exceeding max size', () => {
      const { result } = renderHook(() => useFileStaging())
      const file = createFile('huge.png', MAX_SIZE + 1, 'image/png')

      act(() => result.current.addFiles([file]))

      expect(result.current.stagedFiles).toHaveLength(0)
    })

    it('filters mixed batches — keeps valid, discards invalid', () => {
      const { result } = renderHook(() => useFileStaging())
      const valid = createFile('ok.jpeg', 2048, 'image/jpeg')
      const wrongType = createFile('nope.txt', 100, 'text/plain')
      const tooLarge = createFile('big.gif', MAX_SIZE + 1, 'image/gif')

      act(() => result.current.addFiles([valid, wrongType, tooLarge]))

      expect(result.current.stagedFiles).toHaveLength(1)
      expect(result.current.stagedFiles[0]?.name).toBe('ok.jpeg')
    })

    it('accumulates files across multiple calls', () => {
      const { result } = renderHook(() => useFileStaging())
      const a = createFile('a.png', 1024, 'image/png')
      const b = createFile('b.png', 1024, 'image/png')

      act(() => result.current.addFiles([a]))
      act(() => result.current.addFiles([b]))

      expect(result.current.stagedFiles).toHaveLength(2)
      expect(result.current.previewUrls).toHaveLength(2)
    })

    it('creates object URLs for valid files', () => {
      const { result } = renderHook(() => useFileStaging())
      const file = createFile('pic.webp', 500, 'image/webp')

      act(() => result.current.addFiles([file]))

      expect(URL.createObjectURL).toHaveBeenCalledWith(file)
      expect(result.current.previewUrls[0]).toMatch(/^blob:mock-/)
    })
  })

  describe('removeFile', () => {
    it('removes the correct file by index', () => {
      const { result } = renderHook(() => useFileStaging())
      const a = createFile('a.png', 100, 'image/png')
      const b = createFile('b.png', 100, 'image/png')
      const c = createFile('c.png', 100, 'image/png')

      act(() => result.current.addFiles([a, b, c]))
      const urlToRevoke = result.current.previewUrls[1]!

      act(() => result.current.removeFile(1))

      expect(result.current.stagedFiles).toHaveLength(2)
      expect(result.current.stagedFiles.map((f) => f.name)).toEqual(['a.png', 'c.png'])
      expect(revokedUrls.has(urlToRevoke), 'Should revoke the removed file URL').toBe(true)
    })

    it('clears hasFiles when last file is removed', () => {
      const { result } = renderHook(() => useFileStaging())
      const file = createFile('solo.png', 100, 'image/png')

      act(() => result.current.addFiles([file]))
      expect(result.current.hasFiles).toBe(true)

      act(() => result.current.removeFile(0))
      expect(result.current.hasFiles).toBe(false)
      expect(result.current.stagedFiles).toHaveLength(0)
    })
  })

  describe('clearFiles', () => {
    it('clears all files and revokes all URLs', () => {
      const { result } = renderHook(() => useFileStaging())
      const a = createFile('a.png', 100, 'image/png')
      const b = createFile('b.png', 100, 'image/png')

      act(() => result.current.addFiles([a, b]))
      const urls = [...result.current.previewUrls]

      act(() => result.current.clearFiles())

      expect(result.current.stagedFiles).toHaveLength(0)
      expect(result.current.previewUrls).toHaveLength(0)
      expect(result.current.hasFiles).toBe(false)
      for (const url of urls) {
        expect(revokedUrls.has(url), `Should revoke ${url}`).toBe(true)
      }
    })
  })

  describe('custom options', () => {
    it('respects custom allowedTypes', () => {
      const { result } = renderHook(() =>
        useFileStaging({ allowedTypes: ['image/png'] })
      )
      const png = createFile('ok.png', 100, 'image/png')
      const jpeg = createFile('no.jpeg', 100, 'image/jpeg')

      act(() => result.current.addFiles([png, jpeg]))

      expect(result.current.stagedFiles).toHaveLength(1)
      expect(result.current.stagedFiles[0]?.name).toBe('ok.png')
    })

    it('respects custom maxSize', () => {
      const { result } = renderHook(() =>
        useFileStaging({ maxSize: 500 })
      )
      const small = createFile('small.png', 400, 'image/png')
      const big = createFile('big.png', 600, 'image/png')

      act(() => result.current.addFiles([small, big]))

      expect(result.current.stagedFiles).toHaveLength(1)
      expect(result.current.stagedFiles[0]?.name).toBe('small.png')
    })
  })

  describe('drag handlers', () => {
    it('onDragOver sets isDragOver to true', () => {
      const { result } = renderHook(() => useFileStaging())
      const event = { preventDefault: vi.fn() } as unknown as React.DragEvent

      act(() => result.current.dragHandlers.onDragOver(event))

      expect(result.current.isDragOver).toBe(true)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('onDragLeave resets isDragOver to false', () => {
      const { result } = renderHook(() => useFileStaging())
      const event = { preventDefault: vi.fn() } as unknown as React.DragEvent

      act(() => result.current.dragHandlers.onDragOver(event))
      expect(result.current.isDragOver).toBe(true)

      act(() => result.current.dragHandlers.onDragLeave(event))
      expect(result.current.isDragOver).toBe(false)
    })

    it('onDrop adds files and resets isDragOver', () => {
      const { result } = renderHook(() => useFileStaging())
      const file = createFile('dropped.png', 100, 'image/png')
      const event = {
        preventDefault: vi.fn(),
        dataTransfer: { files: [file] as unknown as FileList & { length: number } },
      } as unknown as React.DragEvent

      act(() => result.current.dragHandlers.onDragOver({ preventDefault: vi.fn() } as unknown as React.DragEvent))
      act(() => result.current.dragHandlers.onDrop(event))

      expect(result.current.isDragOver).toBe(false)
      expect(result.current.stagedFiles).toHaveLength(1)
      expect(result.current.stagedFiles[0]?.name).toBe('dropped.png')
    })
  })

  describe('handlePaste', () => {
    it('adds pasted image files', () => {
      const { result } = renderHook(() => useFileStaging())
      const file = createFile('pasted.png', 200, 'image/png')
      const event = {
        clipboardData: { files: [file] as unknown as FileList & { length: number } },
      } as unknown as React.ClipboardEvent<HTMLTextAreaElement>

      act(() => result.current.handlePaste(event))

      expect(result.current.stagedFiles).toHaveLength(1)
      expect(result.current.stagedFiles[0]?.name).toBe('pasted.png')
    })
  })

  describe('cleanup on unmount', () => {
    it('revokes all preview URLs when unmounted', () => {
      const { result, unmount } = renderHook(() => useFileStaging())
      const a = createFile('a.png', 100, 'image/png')
      const b = createFile('b.png', 100, 'image/png')

      act(() => result.current.addFiles([a, b]))
      const urls = [...result.current.previewUrls]
      expect(urls).toHaveLength(2)

      unmount()

      for (const url of urls) {
        expect(revokedUrls.has(url), `Should revoke ${url} on unmount`).toBe(true)
      }
    })
  })

  describe('constants', () => {
    it('ALLOWED_TYPES includes expected image types', () => {
      expect(ALLOWED_TYPES).toContain('image/png')
      expect(ALLOWED_TYPES).toContain('image/jpeg')
      expect(ALLOWED_TYPES).toContain('image/gif')
      expect(ALLOWED_TYPES).toContain('image/webp')
      expect(ALLOWED_TYPES).toContain('image/svg+xml')
    })

    it('MAX_SIZE is 10 MB', () => {
      expect(MAX_SIZE).toBe(10 * 1024 * 1024)
    })
  })
})
