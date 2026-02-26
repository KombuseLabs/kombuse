import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginPublishService, PluginPublishError } from '../plugin-publish-service'
import { pluginExportService } from '../plugin-export-service'
import type { PluginPublishInput, PluginExportResult } from '@kombuse/types'

vi.mock('../plugin-export-service', () => ({
  pluginExportService: {
    exportPackage: vi.fn(),
  },
}))

vi.mock('tar', () => ({
  create: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    readFile: vi.fn().mockResolvedValue(Buffer.from('fake-archive-data')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  }
})

function makePublishInput(overrides: Partial<PluginPublishInput> = {}): PluginPublishInput {
  return {
    package_name: 'test-plugin',
    project_id: 'proj-1',
    author: 'acme',
    registry_url: 'https://kombuse.dev',
    token: 'test-token',
    ...overrides,
  }
}

const mockExportResult: PluginExportResult = {
  package_name: 'test-plugin',
  directory: '/tmp/test-plugin',
  agent_count: 2,
  label_count: 1,
  file_count: 0,
  files: ['manifest.json', '.kombuse-plugin/plugin.json', 'agents/agent-a.md'],
}

describe('PluginPublishService', () => {
  let service: PluginPublishService
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    service = new PluginPublishService()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(pluginExportService.exportPackage).mockReturnValue(mockExportResult)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should publish successfully and return result', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        published: {
          author: 'acme',
          name: 'test-plugin',
          version: '1.0.0',
          channel: 'stable',
          download_url: '/api/pkg/acme/test-plugin/versions/1.0.0/download',
        },
      }),
    })

    const result = await service.publish(makePublishInput())

    expect(result).toEqual({
      author: 'acme',
      name: 'test-plugin',
      version: '1.0.0',
      channel: 'stable',
      download_url: '/api/pkg/acme/test-plugin/versions/1.0.0/download',
    })
  })

  it('should call export with correct parameters', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        published: {
          author: 'acme',
          name: 'test-plugin',
          version: '2.0.0',
          channel: 'stable',
          download_url: '/dl',
        },
      }),
    })

    await service.publish(makePublishInput({ version: '2.0.0', description: 'A plugin' }))

    expect(pluginExportService.exportPackage).toHaveBeenCalledWith({
      package_name: 'test-plugin',
      project_id: 'proj-1',
      agent_ids: undefined,
      author: 'acme',
      version: '2.0.0',
      description: 'A plugin',
      overwrite: true,
    })
  })

  it('should POST to correct registry URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        published: { author: 'acme', name: 'test-plugin', version: '1.0.0', channel: 'stable', download_url: '/dl' },
      }),
    })

    await service.publish(makePublishInput())

    expect(fetchMock).toHaveBeenCalledWith(
      'https://kombuse.dev/api/pkg/acme/test-plugin',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/gzip',
        }),
      })
    )
  })

  it('should include channel in URL when provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        published: { author: 'acme', name: 'test-plugin', version: '1.0.0', channel: 'beta', download_url: '/dl' },
      }),
    })

    await service.publish(makePublishInput({ channel: 'beta' }))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://kombuse.dev/api/pkg/acme/test-plugin?channel=beta',
      expect.any(Object)
    )
  })

  it('should throw PluginPublishError on 401', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'Invalid token' }),
    })

    await expect(service.publish(makePublishInput())).rejects.toThrow(PluginPublishError)
    await expect(service.publish(makePublishInput())).rejects.toThrow('Invalid token')
  })

  it('should throw PluginPublishError on 409 version conflict', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ error: 'Version already exists' }),
    })

    const error = await service.publish(makePublishInput()).catch((e) => e)
    expect(error).toBeInstanceOf(PluginPublishError)
    expect(error.statusCode).toBe(409)
  })

  it('should throw PluginPublishError on 413 too large', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 413,
      text: async () => JSON.stringify({ error: 'Archive exceeds 15 MB' }),
    })

    const error = await service.publish(makePublishInput()).catch((e) => e)
    expect(error).toBeInstanceOf(PluginPublishError)
    expect(error.statusCode).toBe(413)
  })

  it('should handle non-JSON error responses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    const error = await service.publish(makePublishInput()).catch((e) => e)
    expect(error).toBeInstanceOf(PluginPublishError)
    expect(error.message).toBe('Internal Server Error')
  })
})
