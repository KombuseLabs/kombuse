import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Header } from '../header'

const { mockUseDesktop, mockExecute } = vi.hoisted(() => ({
  mockUseDesktop: vi.fn(),
  mockExecute: vi.fn(),
}))

vi.mock('@/hooks/use-desktop', () => ({
  useDesktop: mockUseDesktop,
}))

vi.mock('@/hooks', () => ({
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
    expect(header.className).toContain('pl-24')
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
    expect(header.className).not.toContain('pl-24')
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

  it('does not render nav arrows when props are omitted', () => {
    mockUseDesktop.mockReturnValue({
      isDesktop: true,
      platform: 'darwin',
      selectDirectory: async () => null,
    })

    render(<Header />)

    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Go forward' })).toBeNull()
  })

  it('renders nav arrows when onGoBack and onGoForward are provided', () => {
    mockUseDesktop.mockReturnValue({
      isDesktop: true,
      platform: 'darwin',
      selectDirectory: async () => null,
    })

    render(
      <Header
        onGoBack={() => {}}
        onGoForward={() => {}}
        canGoBack={false}
        canGoForward={false}
      />
    )

    expect(screen.getByRole('button', { name: 'Go back' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Go forward' })).toBeDefined()
  })

  it('disables back button when canGoBack is false and forward when canGoForward is false', () => {
    mockUseDesktop.mockReturnValue({
      isDesktop: true,
      platform: 'darwin',
      selectDirectory: async () => null,
    })

    render(
      <Header
        onGoBack={() => {}}
        onGoForward={() => {}}
        canGoBack={false}
        canGoForward={false}
      />
    )

    expect(screen.getByRole('button', { name: 'Go back' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Go forward' })).toHaveProperty('disabled', true)
  })

  it('enables buttons when canGoBack and canGoForward are true', () => {
    mockUseDesktop.mockReturnValue({
      isDesktop: true,
      platform: 'darwin',
      selectDirectory: async () => null,
    })

    render(
      <Header
        onGoBack={() => {}}
        onGoForward={() => {}}
        canGoBack={true}
        canGoForward={true}
      />
    )

    expect(screen.getByRole('button', { name: 'Go back' })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: 'Go forward' })).toHaveProperty('disabled', false)
  })

  it('calls onGoBack and onGoForward when clicked', () => {
    const onGoBack = vi.fn()
    const onGoForward = vi.fn()
    mockUseDesktop.mockReturnValue({
      isDesktop: true,
      platform: 'darwin',
      selectDirectory: async () => null,
    })

    render(
      <Header
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        canGoBack={true}
        canGoForward={true}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(onGoBack).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Go forward' }))
    expect(onGoForward).toHaveBeenCalledTimes(1)
  })

  it('applies electron-no-drag to nav arrows wrapper', () => {
    mockUseDesktop.mockReturnValue({
      isDesktop: true,
      platform: 'darwin',
      selectDirectory: async () => null,
    })

    render(
      <Header
        onGoBack={() => {}}
        onGoForward={() => {}}
        canGoBack={true}
        canGoForward={true}
      />
    )

    const backBtn = screen.getByRole('button', { name: 'Go back' })
    const wrapper = backBtn.parentElement
    expect(wrapper?.className).toContain('electron-no-drag')
  })

  it('hides center section, nav arrows, and right nav when minimal is true', () => {
    mockUseDesktop.mockReturnValue({
      isDesktop: true,
      platform: 'darwin',
      selectDirectory: async () => null,
    })

    const { container } = render(
      <Header
        minimal
        onGoBack={() => {}}
        onGoForward={() => {}}
        canGoBack={true}
        canGoForward={true}
        center={<span>Center Search</span>}
      >
        <button type="button" aria-label="Active Agents" />
      </Header>
    )

    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Go forward' })).toBeNull()
    expect(screen.queryByText('Center Search')).toBeNull()
    expect(container.querySelector('nav')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Toggle theme' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Active Agents' })).toBeNull()
  })

  it('still shows the title when minimal is true', () => {
    mockUseDesktop.mockReturnValue({
      isDesktop: true,
      platform: 'darwin',
      selectDirectory: async () => null,
    })

    render(<Header minimal />)

    expect(screen.getByRole('button', { name: 'Kombuse' })).toBeDefined()
  })

  it('still applies macOS pl-24 padding and desktop classes when minimal is true', () => {
    mockUseDesktop.mockReturnValue({
      isDesktop: true,
      platform: 'darwin',
      selectDirectory: async () => null,
    })

    render(<Header minimal />)

    const header = screen.getByRole('banner')
    expect(header.className).toContain('pl-24')
    expect(header.className).toContain('electron-drag')
    expect(header.className).toContain('h-10')
  })
})
