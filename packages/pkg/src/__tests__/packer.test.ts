import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdir } from 'node:fs/promises'
import { extract } from 'tar'
import { pack } from '../packer'
import { PackError } from '../errors'
import { computeSha256 } from '../cache/integrity'

describe('pack', () => {
  let tempDir: string
  let sourceDir: string
  let outputDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pkg-packer-'))
    sourceDir = join(tempDir, 'source')
    outputDir = join(tempDir, 'output')
    mkdirSync(sourceDir, { recursive: true })
    mkdirSync(outputDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should create a tar.gz archive', async () => {
    writeFileSync(join(sourceDir, 'hello.txt'), 'world')
    const outputPath = join(outputDir, 'test.tar.gz')

    const result = await pack({ sourceDir, outputPath })

    expect(existsSync(result.archivePath)).toBe(true)
    expect(result.archivePath).toBe(outputPath)
    expect(result.size).toBeGreaterThan(0)
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should produce a valid checksum', async () => {
    writeFileSync(join(sourceDir, 'data.txt'), 'checksum test')
    const outputPath = join(outputDir, 'checksum.tar.gz')

    const result = await pack({ sourceDir, outputPath })
    const verifyHash = await computeSha256(outputPath)

    expect(result.checksum).toBe(verifyHash)
  })

  it('should create flat archive by default', async () => {
    writeFileSync(join(sourceDir, 'manifest.json'), '{}')
    mkdirSync(join(sourceDir, 'agents'), { recursive: true })
    writeFileSync(join(sourceDir, 'agents', 'test.md'), '# Test')
    const outputPath = join(outputDir, 'flat.tar.gz')

    await pack({ sourceDir, outputPath })

    const extractDir = join(tempDir, 'extracted-flat')
    await mkdir(extractDir, { recursive: true })
    await extract({ file: outputPath, cwd: extractDir })

    expect(existsSync(join(extractDir, 'manifest.json'))).toBe(true)
    expect(existsSync(join(extractDir, 'agents', 'test.md'))).toBe(true)
    expect(existsSync(join(extractDir, 'package'))).toBe(false)
  })

  it('should create prefixed archive when prefix is "package"', async () => {
    writeFileSync(join(sourceDir, 'manifest.json'), '{"name":"test"}')
    const outputPath = join(outputDir, 'prefixed.tar.gz')

    await pack({ sourceDir, outputPath, prefix: 'package' })

    const extractDir = join(tempDir, 'extracted-prefixed')
    await mkdir(extractDir, { recursive: true })
    await extract({ file: outputPath, cwd: extractDir })

    expect(existsSync(join(extractDir, 'package', 'manifest.json'))).toBe(true)
  })

  it('should roundtrip file contents correctly', async () => {
    writeFileSync(join(sourceDir, 'data.txt'), 'hello roundtrip')
    mkdirSync(join(sourceDir, 'sub'))
    writeFileSync(join(sourceDir, 'sub', 'nested.txt'), 'nested content')
    const outputPath = join(outputDir, 'roundtrip.tar.gz')

    await pack({ sourceDir, outputPath })

    const extractDir = join(tempDir, 'extracted-roundtrip')
    await mkdir(extractDir, { recursive: true })
    await extract({ file: outputPath, cwd: extractDir })

    expect(readFileSync(join(extractDir, 'data.txt'), 'utf-8')).toBe('hello roundtrip')
    expect(readFileSync(join(extractDir, 'sub', 'nested.txt'), 'utf-8')).toBe('nested content')
  })

  it('should throw PackError for non-existent source directory', async () => {
    const outputPath = join(outputDir, 'fail.tar.gz')

    await expect(
      pack({ sourceDir: join(tempDir, 'nonexistent'), outputPath })
    ).rejects.toThrow(PackError)
  })

  it('should handle directories with deeply nested subdirectories', async () => {
    mkdirSync(join(sourceDir, 'a', 'b', 'c'), { recursive: true })
    writeFileSync(join(sourceDir, 'a', 'b', 'c', 'deep.txt'), 'deep')
    const outputPath = join(outputDir, 'nested.tar.gz')

    const result = await pack({ sourceDir, outputPath })

    const extractDir = join(tempDir, 'extracted-nested')
    await mkdir(extractDir, { recursive: true })
    await extract({ file: result.archivePath, cwd: extractDir })

    expect(readFileSync(join(extractDir, 'a', 'b', 'c', 'deep.txt'), 'utf-8')).toBe('deep')
  })

  it('should handle empty source directory', async () => {
    const outputPath = join(outputDir, 'empty.tar.gz')
    const result = await pack({ sourceDir, outputPath })

    expect(result.size).toBeGreaterThan(0)
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/)
  })
})
