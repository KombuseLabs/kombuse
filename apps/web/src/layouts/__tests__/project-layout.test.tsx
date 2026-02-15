import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const {
  mockSidebarProps,
  mockSidebarItemProps,
  mockUseProfileSetting,
  mockSetCurrentProjectId,
} = vi.hoisted(() => ({
  mockSidebarProps: vi.fn(),
  mockSidebarItemProps: vi.fn(),
  mockUseProfileSetting: vi.fn(),
  mockSetCurrentProjectId: vi.fn(),
}))

vi.mock('@kombuse/ui/components', () => ({
  Sidebar: ({ children, ...props }: any) => {
    mockSidebarProps(props)
    return (
      <aside data-testid="project-sidebar" data-variant={props.variant}>
        {children}
      </aside>
    )
  },
  SidebarItem: (props: any) => {
    mockSidebarItemProps(props)
    return <a href={props.to}>{props.label}</a>
  },
}))

vi.mock('@kombuse/ui/hooks', () => ({
  useProject: () => ({
    data: { name: 'Alpha' },
  }),
  useProfileSetting: (...args: unknown[]) => mockUseProfileSetting(...args),
  useAppContext: () => ({
    setCurrentProjectId: mockSetCurrentProjectId,
  }),
}))

import { ProjectLayout } from '../project-layout'

function renderProjectLayout(path = '/projects/1/tickets') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectLayout />}>
          <Route path="tickets" element={<div>Tickets view</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function collectedSidebarLabels(): string[] {
  return [
    ...new Set(
      mockSidebarItemProps.mock.calls.map((call) => call[0]?.label as string),
    ),
  ]
}

describe('ProjectLayout rail navigation', () => {
  beforeEach(() => {
    mockSidebarProps.mockReset()
    mockSidebarItemProps.mockReset()
    mockSetCurrentProjectId.mockReset()
    mockUseProfileSetting.mockReset()
    mockUseProfileSetting.mockImplementation((_profileId: string, _key: string) => ({
      data: { setting_value: 'false' },
    }))
  })

  it('renders project navigation as rail and keeps rail item labels', () => {
    renderProjectLayout()

    const sidebar = screen.getByTestId('project-sidebar')
    expect(sidebar.getAttribute('data-variant')).toBe('rail')

    const labels = collectedSidebarLabels()
    expect(labels).toEqual(expect.arrayContaining([
      'Tickets',
      'Chats',
      'Agents',
      'Labels',
      'Events',
      'Permissions',
      'Database',
    ]))

    const allRailItems = mockSidebarItemProps.mock.calls.every(
      (call) => call[0]?.variant === 'rail',
    )
    expect(allRailItems).toBe(true)
    expect(mockSetCurrentProjectId).toHaveBeenCalledWith('1')
  })

  it('hides optional navigation items when profile settings hide them', () => {
    mockUseProfileSetting.mockImplementation((_profileId: string, key: string) => {
      if (
        key === 'sidebar.hidden.events'
        || key === 'sidebar.hidden.permissions'
        || key === 'sidebar.hidden.database'
      ) {
        return { data: { setting_value: 'true' } }
      }
      return { data: { setting_value: 'false' } }
    })

    renderProjectLayout()
    const labels = collectedSidebarLabels()
    expect(labels).toEqual(expect.arrayContaining(['Tickets', 'Chats', 'Agents', 'Labels']))
    expect(labels.includes('Events')).toBe(false)
    expect(labels.includes('Permissions')).toBe(false)
    expect(labels.includes('Database')).toBe(false)
  })
})
