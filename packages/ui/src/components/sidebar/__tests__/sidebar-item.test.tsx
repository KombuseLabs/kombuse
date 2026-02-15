import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SidebarItem } from '../sidebar-item'

vi.mock('../../../base/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}))

function renderSidebarItem({
  initialPath,
  to,
  label,
  variant,
}: {
  initialPath: string
  to: string
  label: string
  variant: 'panel' | 'rail'
}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/projects/:projectId/:section"
          element={
            <SidebarItem
              icon={<span aria-hidden>icon</span>}
              label={label}
              to={to}
              variant={variant}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SidebarItem', () => {
  it('uses rail styling with tooltip label and active emphasis in rail mode', () => {
    renderSidebarItem({
      initialPath: '/projects/1/tickets',
      to: '/projects/1/tickets',
      label: 'Tickets',
      variant: 'rail',
    })

    const link = screen.getByRole('link', { name: 'Tickets' })
    expect(link.className.includes('size-11')).toBe(true)
    expect(link.className.includes('ring-1')).toBe(true)
    expect(screen.getByTestId('tooltip-content').textContent).toBe('Tickets')
  })

  it('renders inline label and no tooltip wrapper in panel mode', () => {
    renderSidebarItem({
      initialPath: '/projects/1/chats',
      to: '/projects/1/chats',
      label: 'Chats',
      variant: 'panel',
    })

    expect(screen.getByText('Chats')).toBeDefined()
    expect(screen.queryByTestId('tooltip-content')).toBeNull()
  })
})
