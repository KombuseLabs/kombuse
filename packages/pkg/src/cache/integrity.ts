import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { IntegrityError } from '../errors'

export async function computeSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(filePath)
  for await (const chunk of stream) {
    hash.update(chunk)
  }
  return hash.digest('hex').toLowerCase()
}

export async function verifySha256(
  filePath: string,
  expectedHash: string
): Promise<void> {
  const actualHash = await computeSha256(filePath)
  if (actualHash !== expectedHash.toLowerCase()) {
    throw new IntegrityError(expectedHash, actualHash)
  }
}
