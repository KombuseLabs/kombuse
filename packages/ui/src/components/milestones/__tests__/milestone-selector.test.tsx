import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { MilestoneWithStats } from '@kombuse/types'
import { MilestoneSelector } from '../milestone-selector'

// Mock Popover to always render open
vi.mock('@/base/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock Command components as simple pass-through elements
vi.mock('@/base/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: () => <input placeholder="Search milestones..." />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode
    onSelect?: () => void
  }) => (
    <div role="option" onClick={onSelect}>
      {children}
    </div>
  ),
  CommandSeparator: () => <hr />,
}))

const buildMilestone = (overrides: Partial<MilestoneWithStats> = {}): MilestoneWithStats => ({
  id: 1,
  project_id: '1',
  title: 'v1.0 Release',
  description: null,
  due_date: null,
  status: 'open',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  open_count: 5,
  closed_count: 3,
  total_count: 8,
  ...overrides,
})

describe('MilestoneSelector', () => {
  const defaultProps = {
    availableMilestones: [buildMilestone()],
    selectedMilestoneId: null as number | null,
    onSelect: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('trigger rendering', () => {
    it('renders outline button when no milestone is selected', () => {
      render(<MilestoneSelector {...defaultProps} />)
      expect(screen.getByRole('combobox')).toBeDefined()
      expect(screen.getByText('Set milestone...')).toBeDefined()
    })

    it('renders custom placeholder when provided', () => {
      render(<MilestoneSelector {...defaultProps} placeholder="Choose milestone" />)
      expect(screen.getByText('Choose milestone')).toBeDefined()
    })

    it('renders badge-style trigger when milestone is selected', () => {
      render(<MilestoneSelector {...defaultProps} selectedMilestoneId={1} />)
      // Title appears in both the badge trigger and the dropdown list
      const titles = screen.getAllByText('v1.0 Release')
      const badgeTitle = titles.find((el) => el.closest('button')?.className.includes('rounded-full'))
      expect(badgeTitle, 'Badge trigger with rounded-full should exist').toBeDefined()
      expect(badgeTitle!.closest('button')!.className).toContain('bg-blue-100')
    })

    it('renders gray badge for closed milestones', () => {
      const closed = buildMilestone({ id: 2, status: 'closed', title: 'v0.9' })
      render(
        <MilestoneSelector
          {...defaultProps}
          availableMilestones={[closed]}
          selectedMilestoneId={2}
        />
      )
      const titles = screen.getAllByText('v0.9')
      const badgeTitle = titles.find((el) => el.closest('button')?.className.includes('rounded-full'))
      expect(badgeTitle, 'Badge trigger with rounded-full should exist').toBeDefined()
      expect(badgeTitle!.closest('button')!.className).toContain('bg-gray-100')
    })

    it('shows progress in badge trigger when showProgress is true', () => {
      render(
        <MilestoneSelector {...defaultProps} selectedMilestoneId={1} showProgress />
      )
      // The progress appears in both the badge trigger and the dropdown list item.
      // The badge trigger's progress has opacity-70 class.
      const progressElements = screen.getAllByText('3/8')
      const badgeProgress = progressElements.find((el) => el.className.includes('opacity-70'))
      expect(badgeProgress, 'Badge trigger should show progress with opacity-70').toBeDefined()
    })

    it('does not show progress in badge trigger when showProgress is false', () => {
      render(
        <MilestoneSelector {...defaultProps} selectedMilestoneId={1} showProgress={false} />
      )
      // Only the dropdown list item should show progress, not the badge trigger
      const progressElements = screen.getAllByText('3/8')
      const badgeProgress = progressElements.find((el) => el.className.includes('opacity-70'))
      expect(badgeProgress, 'Badge trigger should not show progress').toBeUndefined()
    })

    it('does not show progress in badge trigger when total_count is 0', () => {
      const empty = buildMilestone({ total_count: 0, closed_count: 0, open_count: 0 })
      render(
        <MilestoneSelector
          {...defaultProps}
          availableMilestones={[empty]}
          selectedMilestoneId={1}
          showProgress
        />
      )
      expect(screen.queryByText('0/0')).toBeNull()
    })
  })
})
