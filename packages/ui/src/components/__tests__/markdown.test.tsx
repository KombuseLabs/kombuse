import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Markdown } from '../markdown'

vi.mock('@/hooks/use-shiki', () => ({
  useShiki: () => ({
    ready: true,
    highlight: () => null,
  }),
}))

describe('Markdown', () => {
  it('renders a single newline as one line break in the same paragraph', () => {
    const { container } = render(<Markdown>{'alpha\nbeta'}</Markdown>)

    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]?.querySelectorAll('br')).toHaveLength(1)
  })

  it('preserves double newlines as paragraph breaks without extra line breaks', () => {
    const { container } = render(<Markdown>{'alpha\n\nbeta'}</Markdown>)

    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(container.querySelectorAll('br')).toHaveLength(0)
  })

  it('does not inject line breaks into fenced code blocks', () => {
    const { container } = render(<Markdown>{'```txt\nalpha\nbeta\n```'}</Markdown>)

    const code = container.querySelector('pre code')
    expect(code?.textContent).toContain('alpha\nbeta')
    expect(container.querySelectorAll('pre br')).toHaveLength(0)
  })
})
