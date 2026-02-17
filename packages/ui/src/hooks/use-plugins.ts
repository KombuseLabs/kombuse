import { useMutation } from '@tanstack/react-query'
import type { PluginExportInput } from '@kombuse/types'
import { pluginsApi } from '../lib/api'

export function useExportPlugin() {
  return useMutation({
    mutationFn: (input: PluginExportInput) => pluginsApi.exportPlugin(input),
  })
}
