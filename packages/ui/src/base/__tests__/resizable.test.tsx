import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { groupSpy } = vi.hoisted(() => ({
  groupSpy: vi.fn(),
}))

vi.mock('react-resizable-panels', () => ({
  Group: ({ children, ...props }: any) => {
    groupSpy(props)
    return <div data-testid='group'>{children}</div>
  },
  Panel: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Separator: ({ children, ...props }: any) => (
    <div role='separator' data-testid='separator' {...props}>
      {children}
    </div>
  ),
}))

import { ResizableCardHandle, ResizableCardPanel, ResizableHandle, ResizablePanelGroup } from '../resizable'

describe('Resizable primitives', () => {
  beforeEach(() => {
    groupSpy.mockReset()
  })

  it('applies a default resize target minimum size for drag affordance', () => {
    render(<ResizablePanelGroup orientation='horizontal' />)

    expect(groupSpy).toHaveBeenCalledTimes(1)
    const groupProps = groupSpy.mock.calls[0]?.[0]
    expect(groupProps.resizeTargetMinimumSize).toEqual({
      coarse: 24,
      fine: 12,
    })
  })

  it('allows resize target minimum size overrides', () => {
    const customTarget = { coarse: 28, fine: 16 }
    render(
      <ResizablePanelGroup
        orientation='horizontal'
        resizeTargetMinimumSize={customTarget}
      />
    )

    const groupProps = groupSpy.mock.calls[0]?.[0]
    expect(groupProps.resizeTargetMinimumSize).toEqual(customTarget)
  })

  it('exposes state, focus, and orientation class contracts for the handle', () => {
    render(<ResizableHandle withHandle className='custom-handle' />)

    const separator = screen.getByRole('separator')
    const className = separator.getAttribute('class') ?? ''

    expect(className).toContain('data-[separator=hover]:bg-foreground/15')
    expect(className).toContain('data-[separator=active]:bg-foreground/30')
    expect(className).toContain('focus-visible:ring-2')
    expect(className).toContain('focus-visible:ring-offset-background')
    expect(className).toContain('cursor-col-resize')
    expect(className).toContain('aria-[orientation=horizontal]:cursor-row-resize')
    expect(className).toContain('[&[aria-orientation=horizontal]>div]:rotate-90')
    expect(className).toContain('[&[data-separator=active]>div]:shadow-sm')
    expect(className).toContain('custom-handle')
  })

  it('renders a modernized grip when withHandle is enabled', () => {
    render(<ResizableHandle withHandle />)

    const separator = screen.getByRole('separator')
    const grip = separator.querySelector('div')

    expect(grip).not.toBeNull()
    expect((grip as HTMLElement).className).toContain('h-7')
    expect((grip as HTMLElement).className).toContain('w-4')
  })

  it('renders list/detail panel wrappers with consistent split-card spacing', () => {
    const { rerender } = render(
      <ResizableCardPanel side='list'>List</ResizableCardPanel>
    )

    const listPanel = screen.getByText('List') as HTMLElement
    expect(listPanel.className).toContain('py-6')
    expect(listPanel.className).toContain('pl-6')
    expect(listPanel.className).toContain('pr-3')

    rerender(<ResizableCardPanel side='detail'>Detail</ResizableCardPanel>)
    const detailPanel = screen.getByText('Detail') as HTMLElement
    expect(detailPanel.className).toContain('py-6')
    expect(detailPanel.className).toContain('pl-3')
    expect(detailPanel.className).toContain('pr-6')
  })

  it('renders a transparent split-card handle without extra divider line styling', () => {
    render(<ResizableCardHandle />)

    const separator = screen.getByRole('separator')
    const className = separator.getAttribute('class') ?? ''
    expect(className).toContain('w-0')
    expect(className).toContain('bg-transparent')
    expect(className).toContain('data-[separator=hover]:bg-transparent')
    expect(className).toContain('data-[separator=active]:bg-transparent')
  })
})
