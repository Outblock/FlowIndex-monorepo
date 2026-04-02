/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatTxResult, signWithKey, waitForSeal } from './tx-helpers'

describe('flow/tx-helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns a sealed error result when the REST endpoint reports a failed sealed tx', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'Sealed',
            error_message: 'signature is not valid',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )

    vi.stubGlobal('fetch', fetchMock)

    const pending = waitForSeal('tx-1', 'https://rest-mainnet.onflow.org', 2_500)
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(pending).resolves.toEqual({
      txStatus: {
        status: 4,
        errorMessage: 'signature is not valid',
      },
      timedOut: false,
      timeoutMs: 2_500,
    })
  })

  it('times out cleanly when the transaction result never becomes available', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))

    vi.stubGlobal('fetch', fetchMock)

    const pending = waitForSeal('tx-2', 'https://rest-mainnet.onflow.org', 1_500)
    await vi.advanceTimersByTimeAsync(1_500)

    await expect(pending).resolves.toEqual({
      txStatus: null,
      timedOut: true,
      timeoutMs: 1_500,
    })
  })

  it('formats timed out transactions as submitted instead of leaving them ambiguous', () => {
    expect(formatTxResult('tx-3', null, { timedOut: true, timeoutMs: 1_500 })).toEqual({
      content:
        'Transaction tx-3 submitted successfully, but it did not seal within 2s. ' +
        'Check the transaction later using the transaction ID.',
      transactionId: 'tx-3',
      status: 'SUBMITTED',
    })
  })

  it('accepts private keys with or without a 0x prefix', () => {
    const privateKey = '6a3d7f5c8f3b5d4887a87c4c41f2f1ef5fdc8e0fc01f9b31c7648206dfa81857'
    const message = 'a1b2c3d4'

    expect(signWithKey(privateKey, message)).toBe(signWithKey(`0x${privateKey}`, message))
  })
})
