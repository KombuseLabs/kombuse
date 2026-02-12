import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ProfileButton } from '../profile-button'

describe('ProfileButton', () => {
  it('renders a dropdown trigger with aria-label', () => {
    const { getByRole } = render(<ProfileButton />)
    const button = getByRole('button', { name: 'User menu' })
    expect(button).toBeDefined()
    expect(button.getAttribute('aria-haspopup')).toBe('menu')
  })

  it('renders without crashing when onNavigate is undefined', () => {
    expect(() => render(<ProfileButton />)).not.toThrow()
  })

  it('renders without crashing when onNavigate is provided', () => {
    const onNavigate = vi.fn()
    expect(() => render(<ProfileButton onNavigate={onNavigate} />)).not.toThrow()
  })
})
