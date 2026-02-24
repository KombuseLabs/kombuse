import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { computeSha256, verifySha256 } from '../cache/integrity'
import { IntegrityError } from '../errors'

describe('integrity', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pkg-integrity-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('computeSha256', () => {
    it('should compute correct hash for known content', async () => {
      const content = 'hello world'
      const filePath = join(tempDir, 'test.txt')
      writeFileSync(filePath, content)

      const expected = createHash('sha256').update(content).digest('hex')
      const result = await computeSha256(filePath)

      expect(result).toBe(expected)
    })

    it('should return lowercase hex string', async () => {
      const filePath = join(tempDir, 'test.txt')
      writeFileSync(filePath, 'data')

      const result = await computeSha256(filePath)

      expect(result).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should handle empty files', async () => {
      const filePath = join(tempDir, 'empty.txt')
      writeFileSync(filePath, '')

      const expected = createHash('sha256').update('').digest('hex')
      const result = await computeSha256(filePath)

      expect(result).toBe(expected)
    })

    it('should handle binary content', async () => {
      const filePath = join(tempDir, 'binary.bin')
      const buffer = Buffer.alloc(1024, 0xab)
      writeFileSync(filePath, buffer)

      const expected = createHash('sha256').update(buffer).digest('hex')
      const result = await computeSha256(filePath)

      expect(result).toBe(expected)
    })
  })

  describe('verifySha256', () => {
    it('should succeed when hash matches', async () => {
      const content = 'verified content'
      const filePath = join(tempDir, 'test.txt')
      writeFileSync(filePath, content)

      const hash = createHash('sha256').update(content).digest('hex')

      await expect(verifySha256(filePath, hash)).resolves.toBeUndefined()
    })

    it('should succeed with uppercase expected hash', async () => {
      const content = 'case test'
      const filePath = join(tempDir, 'test.txt')
      writeFileSync(filePath, content)

      const hash = createHash('sha256')
        .update(content)
        .digest('hex')
        .toUpperCase()

      await expect(verifySha256(filePath, hash)).resolves.toBeUndefined()
    })

    it('should throw IntegrityError when hash does not match', async () => {
      const filePath = join(tempDir, 'test.txt')
      writeFileSync(filePath, 'actual content')

      const wrongHash = 'a'.repeat(64)

      await expect(verifySha256(filePath, wrongHash)).rejects.toThrow(
        IntegrityError
      )
    })
  })
})
