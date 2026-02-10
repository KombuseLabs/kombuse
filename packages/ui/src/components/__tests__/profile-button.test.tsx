import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ProfileButton } from '../profile-button'

describe('ProfileButton', () => {
  it('renders a button with aria-label', () => {
    const { getByRole } = render(<ProfileButton />)
    const button = getByRole('button', { name: 'View profile' })
    expect(button).toBeDefined()
  })

  it('calls onNavigate with /profile on click', () => {
    const onNavigate = vi.fn()
    const { getByRole } = render(<ProfileButton onNavigate={onNavigate} />)

    fireEvent.click(getByRole('button'))

    expect(onNavigate).toHaveBeenCalledOnce()
    expect(onNavigate).toHaveBeenCalledWith('/profile')
  })

  it('does not crash when onNavigate is undefined', () => {
    const { getByRole } = render(<ProfileButton />)
    expect(() => fireEvent.click(getByRole('button'))).not.toThrow()
  })
})
