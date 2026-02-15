import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Header } from '../header'

const { mockUseDesktop, mockExecute } = vi.hoisted(() => ({
  mockUseDesktop: vi.fn(),
  mockExecute: vi.fn(),
}))

vi.mock('../../hooks/use-desktop', () => ({
  useDesktop: mockUseDesktop,
}))

vi.mock('../../hooks', () => ({
  useCommand: () => ({
    execute: mockExecute,
  }),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: 'dark',
  }),
}))

describe('Header', () => {
  beforeEach(() => {
    mockUseDesktop.mockReset()
    mockExecute.mockReset()
  })

  it('uses desktop mac chrome classes without a bottom border and adds zone spacing', async () => {
    mockUseDesktop.mockReturnValue({
      isDesktop: true,
      platform: 'darwin',
      selectDirectory: async () => null,
    })

    const { container } = render(
      <Header center={<span>Center Search</span>}>
        <button type="button" className="size-9" aria-label="Active Agents" />
        <button type="button" className="size-9" aria-label="Notifications" />
        <button type="button" className="size-9" aria-label="Profile" />
      </Header>
    )

    const header = screen.getByRole('banner')
    expect(header.className).toContain('h-10')
    expect(header.className).toContain('electron-drag')
    expect(header.className).toContain('pl-20')
    expect(header.className).not.toContain('border-b')

    const centerZone = screen.getByText('Center Search').closest('div')?.parentElement
    expect(centerZone?.className).toContain('px-[21px]')

    const rightNav = container.querySelector('nav')
    expect(rightNav?.className).toContain('px-[5px]')

    const themeToggle = await screen.findByRole('button', { name: 'Toggle theme' })
    expect(themeToggle.className).toContain('size-9')
  })

  it('keeps non-desktop height classes and still omits the bottom border', () => {
    mockUseDesktop.mockReturnValue({
      isDesktop: false,
      platform: null,
      selectDirectory: async () => null,
    })

    render(<Header center={<span>Center Search</span>} />)

    const header = screen.getByRole('banner')
    expect(header.className).toContain('h-16')
    expect(header.className).not.toContain('electron-drag')
    expect(header.className).not.toContain('pl-20')
    expect(header.className).not.toContain('border-b')
  })

  it('keeps home navigation behavior unchanged', () => {
    const onNavigateHome = vi.fn()
    mockUseDesktop.mockReturnValue({
      isDesktop: true,
      platform: 'darwin',
      selectDirectory: async () => null,
    })

    render(<Header onNavigateHome={onNavigateHome} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kombuse' }))

    expect(onNavigateHome).toHaveBeenCalledTimes(1)
  })
})
