/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('APPROVAL_SECRET', 'test-secret-key-for-hmac-testing-1234')

import { buildCallbackUrls, generateToken, validateToken } from '@/lib/approval/token'

describe('approval token', () => {
  it('generates a valid token', () => {
    const token = generateToken('pending-123', 'approve', 1700000000000)
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
  })

  it('validates a correct token', () => {
    const token = generateToken('pending-123', 'approve', 1700000000000)
    const valid = validateToken(token, 'pending-123', 'approve', 1700000000000)
    expect(valid).toBe(true)
  })

  it('rejects token with wrong action', () => {
    const token = generateToken('pending-123', 'approve', 1700000000000)
    const valid = validateToken(token, 'pending-123', 'reject', 1700000000000)
    expect(valid).toBe(false)
  })

  it('rejects token with wrong pendingId', () => {
    const token = generateToken('pending-123', 'approve', 1700000000000)
    const valid = validateToken(token, 'pending-456', 'approve', 1700000000000)
    expect(valid).toBe(false)
  })

  it('rejects token with wrong expiresAt', () => {
    const token = generateToken('pending-123', 'approve', 1700000000000)
    const valid = validateToken(token, 'pending-123', 'approve', 1700000099999)
    expect(valid).toBe(false)
  })

  it('generates different tokens for approve vs reject', () => {
    const approve = generateToken('pending-123', 'approve', 1700000000000)
    const reject = generateToken('pending-123', 'reject', 1700000000000)
    expect(approve).not.toBe(reject)
  })

  it('builds callback URLs with correct tokens', () => {
    const urls = buildCallbackUrls('https://studio.example.com', 'pending-123', 1700000000000)
    expect(urls.approveUrl).toContain('/api/approval/pending-123/approve?token=')
    expect(urls.rejectUrl).toContain('/api/approval/pending-123/reject?token=')
    expect(urls.detailsUrl).toContain('/api/approval/pending-123?token=')
    // Each URL should have a different token (action-bound)
    const approveToken = new URL(urls.approveUrl).searchParams.get('token')
    const rejectToken = new URL(urls.rejectUrl).searchParams.get('token')
    expect(approveToken).not.toBe(rejectToken)
  })
})
