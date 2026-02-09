'use client'

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type RefObject,
  type DragEvent,
  type ClipboardEvent,
} from 'react'

export const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
export const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface UseFileStagingOptions {
  allowedTypes?: string[]
  maxSize?: number
}

export interface UseFileStagingReturn {
  stagedFiles: File[]
  previewUrls: string[]
  isDragOver: boolean
  hasFiles: boolean
  addFiles: (fileList: FileList | File[]) => void
  removeFile: (index: number) => void
  clearFiles: () => void
  dragHandlers: {
    onDragOver: (e: DragEvent) => void
    onDragLeave: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
  }
  handlePaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  fileInputRef: RefObject<HTMLInputElement | null>
  handleFileInputChange: () => void
}

export function useFileStaging(options?: UseFileStagingOptions): UseFileStagingReturn {
  const allowedTypes = options?.allowedTypes ?? ALLOWED_TYPES
  const maxSize = options?.maxSize ?? MAX_SIZE

  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clean up preview URLs on unmount or when files change
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [previewUrls])

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList)
      const valid: File[] = []

      for (const file of files) {
        if (!allowedTypes.includes(file.type)) continue
        if (file.size > maxSize) continue
        valid.push(file)
      }

      if (valid.length === 0) return

      setStagedFiles((prev) => [...prev, ...valid])
      setPreviewUrls((prev) => [...prev, ...valid.map((f) => URL.createObjectURL(f))])
    },
    [allowedTypes, maxSize]
  )

  const removeFile = useCallback((index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviewUrls((prev) => {
      const url = prev[index]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const clearFiles = useCallback(() => {
    setStagedFiles([])
    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url))
      return []
    })
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files)
      }
    },
    [addFiles]
  )

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = e.clipboardData.files
      if (files.length > 0) {
        addFiles(files)
      }
    },
    [addFiles]
  )

  const handleFileInputChange = useCallback(() => {
    const input = fileInputRef.current
    if (input?.files && input.files.length > 0) {
      addFiles(input.files)
      input.value = ''
    }
  }, [addFiles])

  return {
    stagedFiles,
    previewUrls,
    isDragOver,
    hasFiles: stagedFiles.length > 0,
    addFiles,
    removeFile,
    clearFiles,
    dragHandlers: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
    handlePaste,
    fileInputRef,
    handleFileInputChange,
  }
}
