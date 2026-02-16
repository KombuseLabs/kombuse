import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoResizeTextarea } from '../use-auto-resize-textarea'

function createMockTextarea(scrollHeight: number) {
  let _scrollHeight = scrollHeight
  const style: Record<string, string> = {}
  return {
    style,
    get scrollHeight() {
      return _scrollHeight
    },
    setScrollHeight(h: number) {
      _scrollHeight = h
    },
  }
}

describe('useAutoResizeTextarea', () => {
  beforeEach(() => {
    vi.stubGlobal('innerHeight', 1000)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('maxHeight parsing', () => {
    it('uses a numeric maxHeight directly as pixels', () => {
      const mock = createMockTextarea(500)
      const { result } = renderHook(() =>
        useAutoResizeTextarea({ value: 'test', maxHeight: 300 })
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement
      act(() => { result.current.resize() })

      expect(mock.style.height).toBe('300px')
      expect(mock.style.overflowY).toBe('auto')
    })

    it('converts vh string to pixels using window.innerHeight', () => {
      const mock = createMockTextarea(600)
      const { result } = renderHook(() =>
        useAutoResizeTextarea({ value: 'test', maxHeight: '50vh' })
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement
      act(() => { result.current.resize() })

      // 50vh of 1000px = 500px, scrollHeight 600 > 500 => clamped
      expect(mock.style.height).toBe('500px')
      expect(mock.style.overflowY).toBe('auto')
    })

    it('parses a bare numeric string as pixels', () => {
      const mock = createMockTextarea(500)
      const { result } = renderHook(() =>
        useAutoResizeTextarea({ value: 'test', maxHeight: '400' })
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement
      act(() => { result.current.resize() })

      expect(mock.style.height).toBe('400px')
      expect(mock.style.overflowY).toBe('auto')
    })

    it('falls back to Infinity for unsupported string formats', () => {
      const mock = createMockTextarea(5000)
      const { result } = renderHook(() =>
        useAutoResizeTextarea({ value: 'test', maxHeight: 'auto' })
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement
      act(() => { result.current.resize() })

      // parseFloat('auto') is NaN => Infinity => no clamping
      expect(mock.style.height).toBe('5000px')
      expect(mock.style.overflowY).toBe('hidden')
    })
  })

  describe('enabled flag', () => {
    it('resizes the textarea when enabled is true (default)', () => {
      const mock = createMockTextarea(200)
      const { result } = renderHook(() =>
        useAutoResizeTextarea({ value: 'test' })
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement

      // Trigger the layout effect by rerendering with a new value
      const { rerender } = renderHook(
        ({ value }: { value: string }) => useAutoResizeTextarea({ value }),
        { initialProps: { value: 'a' } }
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement
      rerender({ value: 'b' })

      // resize should have run — but since we set the ref after renderHook,
      // we need to call resize manually to verify it works when enabled
      act(() => { result.current.resize() })
      expect(mock.style.height).toBe('200px')
    })

    it('does not modify textarea style when enabled is false', () => {
      const mock = createMockTextarea(200)
      const { result, rerender } = renderHook(
        ({ value, enabled }: { value: string; enabled: boolean }) =>
          useAutoResizeTextarea({ value, enabled }),
        { initialProps: { value: 'a', enabled: false } }
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement
      rerender({ value: 'b', enabled: false })

      // Style should not have been set by the layout effect
      expect(mock.style.height).toBeUndefined()
    })

    it('resizes when enabled transitions from false to true', () => {
      const mock = createMockTextarea(150)
      const { result, rerender } = renderHook(
        ({ value, enabled }: { value: string; enabled: boolean }) =>
          useAutoResizeTextarea({ value, maxHeight: 300, enabled }),
        { initialProps: { value: 'test', enabled: false } }
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement

      // Transition to enabled
      rerender({ value: 'test', enabled: true })

      expect(mock.style.height).toBe('150px')
      expect(mock.style.overflowY).toBe('hidden')
    })
  })

  describe('resize clamping', () => {
    it('sets height to scrollHeight when under maxHeight', () => {
      const mock = createMockTextarea(100)
      const { result } = renderHook(() =>
        useAutoResizeTextarea({ value: 'test', maxHeight: 500 })
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement
      act(() => { result.current.resize() })

      expect(mock.style.height).toBe('100px')
      expect(mock.style.overflowY).toBe('hidden')
    })

    it('clamps height to maxHeight when scrollHeight exceeds it', () => {
      const mock = createMockTextarea(800)
      const { result } = renderHook(() =>
        useAutoResizeTextarea({ value: 'test', maxHeight: 300 })
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement
      act(() => { result.current.resize() })

      expect(mock.style.height).toBe('300px')
      expect(mock.style.overflowY).toBe('auto')
    })

    it('uses default maxHeight of 60vh when not specified', () => {
      // window.innerHeight = 1000, so 60vh = 600px
      const mock = createMockTextarea(700)
      const { result } = renderHook(() =>
        useAutoResizeTextarea({ value: 'test' })
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement
      act(() => { result.current.resize() })

      expect(mock.style.height).toBe('600px')
      expect(mock.style.overflowY).toBe('auto')
    })

    it('does nothing when textarea ref is null', () => {
      const { result } = renderHook(() =>
        useAutoResizeTextarea({ value: 'test', maxHeight: 300 })
      )
      // Don't assign a mock — ref stays null
      act(() => { result.current.resize() })
      // Should not throw
    })
  })

  describe('resize on value change', () => {
    it('re-runs resize when value changes', () => {
      const mock = createMockTextarea(100)
      const { result, rerender } = renderHook(
        ({ value }: { value: string }) =>
          useAutoResizeTextarea({ value, maxHeight: 500 }),
        { initialProps: { value: 'short' } }
      )
      result.current.textareaRef.current = mock as unknown as HTMLTextAreaElement

      // Change value to trigger useLayoutEffect
      mock.setScrollHeight(250)
      rerender({ value: 'a longer piece of text' })

      expect(mock.style.height).toBe('250px')
      expect(mock.style.overflowY).toBe('hidden')
    })
  })
})
