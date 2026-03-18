/**
 * Unit tests for the action's entrypoint, src/index.ts
 */

import { jest, describe, it, expect } from '@jest/globals'

const runMock = jest.fn()
jest.unstable_mockModule('../src/main.ts', () => ({
  run: runMock
}))

describe('index', () => {
  it('calls run when imported', async () => {
    await import('../src/index.ts')
    expect(runMock).toHaveBeenCalled()
  })
})
