import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ModelCatalogResponse, ModelOption } from '@kombuse/types'
import { ModelSelector } from '../model-selector'
import { useModels } from '../../hooks/use-models'

vi.mock('../../hooks/use-models', () => ({
  useModels: vi.fn(),
}))

const mockUseModels = vi.mocked(useModels)

function buildModelCatalog(
  overrides: Partial<ModelCatalogResponse> = {},
): ModelCatalogResponse {
  return {
    backend_type: 'codex',
    supports_model_selection: true,
    models: [],
    ...overrides,
  }
}

function buildModel(overrides: Partial<ModelOption> = {}): ModelOption {
  return {
    id: 'model-1',
    name: 'Model One',
    ...overrides,
  }
}

function mockLoaded(catalog: ModelCatalogResponse) {
  mockUseModels.mockReturnValue({
    data: catalog,
    isLoading: false,
  } as unknown as ReturnType<typeof useModels>)
}

describe('ModelSelector', () => {
  beforeEach(() => {
    mockUseModels.mockReset()
  })

  describe('render paths', () => {
    it('renders a disabled select with placeholder when backendType is undefined', () => {
      mockUseModels.mockReturnValue({
        data: undefined,
        isLoading: false,
      } as unknown as ReturnType<typeof useModels>)

      render(<ModelSelector backendType={undefined} value="" onChange={vi.fn()} />)

      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.disabled).toBe(true)
      expect(screen.getByText('Select a backend first')).toBeDefined()
    })

    it('renders a disabled select with loading text while models are loading', () => {
      mockUseModels.mockReturnValue({
        data: undefined,
        isLoading: true,
      } as unknown as ReturnType<typeof useModels>)

      render(<ModelSelector backendType="codex" value="" onChange={vi.fn()} />)

      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.disabled).toBe(true)
      expect(screen.getByText('Loading models...')).toBeDefined()
    })

    it('renders a disabled select when backend does not support model selection', () => {
      mockLoaded(
        buildModelCatalog({
          backend_type: 'claude-code',
          supports_model_selection: false,
        }),
      )

      render(<ModelSelector backendType="claude-code" value="" onChange={vi.fn()} />)

      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.disabled).toBe(true)
      expect(screen.getByText('Not supported')).toBeDefined()
    })

    it('renders only the default option when model catalog is empty', () => {
      mockLoaded(buildModelCatalog({ models: [] }))

      render(<ModelSelector backendType="codex" value="" onChange={vi.fn()} />)

      const options = screen.getByRole('combobox').querySelectorAll('option')
      expect(options).toHaveLength(1)
      expect(options[0]!.textContent).toBe('Use backend default')
    })

    it('renders ungrouped models as direct options without optgroups', () => {
      mockLoaded(
        buildModelCatalog({
          models: [
            buildModel({ id: 'gpt-5', name: 'GPT-5' }),
            buildModel({ id: 'gpt-5-mini', name: 'GPT-5 Mini' }),
          ],
        }),
      )

      render(<ModelSelector backendType="codex" value="" onChange={vi.fn()} />)

      expect(screen.getByText('GPT-5')).toBeDefined()
      expect(screen.getByText('GPT-5 Mini')).toBeDefined()
      expect(
        screen.getByRole('combobox').querySelectorAll('optgroup'),
      ).toHaveLength(0)
    })

    it('renders grouped models in optgroup elements and ungrouped models outside', () => {
      mockLoaded(
        buildModelCatalog({
          models: [
            buildModel({
              id: 'local-1',
              name: 'Local Model',
              provider: undefined,
            }),
            buildModel({
              id: 'claude-sonnet',
              name: 'Claude Sonnet',
              provider: 'Anthropic',
            }),
            buildModel({
              id: 'claude-opus',
              name: 'Claude Opus',
              provider: 'Anthropic',
            }),
            buildModel({ id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI' }),
          ],
        }),
      )

      render(<ModelSelector backendType="codex" value="" onChange={vi.fn()} />)

      const select = screen.getByRole('combobox')
      const optgroups = select.querySelectorAll('optgroup')
      expect(optgroups).toHaveLength(2)
      expect(optgroups[0]!.getAttribute('label')).toBe('Anthropic')
      expect(optgroups[1]!.getAttribute('label')).toBe('OpenAI')

      expect(screen.getByText('Local Model')).toBeDefined()
      expect(screen.getByText('Claude Sonnet')).toBeDefined()
      expect(screen.getByText('Claude Opus')).toBeDefined()
      expect(screen.getByText('GPT-5')).toBeDefined()
    })

    it('renders a custom option for a value not in the model catalog', () => {
      mockLoaded(
        buildModelCatalog({
          models: [
            buildModel({ id: 'claude-sonnet', name: 'Claude Sonnet' }),
          ],
        }),
      )

      render(
        <ModelSelector
          backendType="codex"
          value="my-custom-model"
          onChange={vi.fn()}
        />,
      )

      expect(screen.getByText('my-custom-model (custom)')).toBeDefined()
    })

    it('does not render a custom option when value matches a catalog model', () => {
      mockLoaded(
        buildModelCatalog({
          models: [
            buildModel({ id: 'claude-sonnet', name: 'Claude Sonnet' }),
          ],
        }),
      )

      render(
        <ModelSelector
          backendType="codex"
          value="claude-sonnet"
          onChange={vi.fn()}
        />,
      )

      expect(screen.queryByText('claude-sonnet (custom)')).toBeNull()
    })

    it('does not render a custom option when value is empty', () => {
      mockLoaded(
        buildModelCatalog({
          models: [
            buildModel({ id: 'claude-sonnet', name: 'Claude Sonnet' }),
          ],
        }),
      )

      render(
        <ModelSelector backendType="codex" value="" onChange={vi.fn()} />,
      )

      expect(screen.queryByText('(custom)')).toBeNull()
    })
  })

  describe('interaction', () => {
    it('calls onChange with the selected model id', () => {
      const onChange = vi.fn()
      mockLoaded(
        buildModelCatalog({
          models: [
            buildModel({ id: 'model-a', name: 'Model A' }),
            buildModel({ id: 'model-b', name: 'Model B' }),
          ],
        }),
      )

      render(
        <ModelSelector backendType="codex" value="" onChange={onChange} />,
      )

      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: 'model-b' },
      })
      expect(onChange).toHaveBeenCalledWith('model-b')
    })

    it('calls onChange with empty string when backend default is selected', () => {
      const onChange = vi.fn()
      mockLoaded(
        buildModelCatalog({
          models: [buildModel({ id: 'model-a', name: 'Model A' })],
        }),
      )

      render(
        <ModelSelector
          backendType="codex"
          value="model-a"
          onChange={onChange}
        />,
      )

      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: '' },
      })
      expect(onChange).toHaveBeenCalledWith('')
    })
  })

  describe('props', () => {
    it('disables the select when disabled prop is true', () => {
      mockLoaded(
        buildModelCatalog({
          models: [buildModel({ id: 'model-a', name: 'Model A' })],
        }),
      )

      render(
        <ModelSelector
          backendType="codex"
          value=""
          onChange={vi.fn()}
          disabled
        />,
      )

      expect(
        (screen.getByRole('combobox') as HTMLSelectElement).disabled,
      ).toBe(true)
    })

    it('forwards the id prop to the select element', () => {
      mockLoaded(buildModelCatalog({ models: [] }))

      render(
        <ModelSelector
          backendType="codex"
          value=""
          onChange={vi.fn()}
          id="model-select"
        />,
      )

      expect(screen.getByRole('combobox').id).toBe('model-select')
    })

    it('forwards the id prop when backendType is undefined', () => {
      mockUseModels.mockReturnValue({
        data: undefined,
        isLoading: false,
      } as unknown as ReturnType<typeof useModels>)

      render(
        <ModelSelector
          backendType={undefined}
          value=""
          onChange={vi.fn()}
          id="model-select"
        />,
      )

      expect(screen.getByRole('combobox').id).toBe('model-select')
    })

    it('shows backend default hint when showDefaultHint is true and default_model_id exists', () => {
      mockLoaded(
        buildModelCatalog({
          models: [],
          default_model_id: 'claude-sonnet-4-5',
        }),
      )

      render(
        <ModelSelector
          backendType="codex"
          value=""
          onChange={vi.fn()}
          showDefaultHint
        />,
      )

      expect(
        screen.getByText('Backend default: claude-sonnet-4-5'),
      ).toBeDefined()
    })

    it('hides backend default hint when showDefaultHint is false', () => {
      mockLoaded(
        buildModelCatalog({
          models: [],
          default_model_id: 'claude-sonnet-4-5',
        }),
      )

      render(
        <ModelSelector
          backendType="codex"
          value=""
          onChange={vi.fn()}
          showDefaultHint={false}
        />,
      )

      expect(
        screen.queryByText('Backend default: claude-sonnet-4-5'),
      ).toBeNull()
    })

    it('does not render a hint when default_model_id is not provided', () => {
      mockLoaded(buildModelCatalog({ models: [] }))

      render(
        <ModelSelector backendType="codex" value="" onChange={vi.fn()} />,
      )

      expect(screen.queryByText(/Backend default/)).toBeNull()
    })
  })
})
