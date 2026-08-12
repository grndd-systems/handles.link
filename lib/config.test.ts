import { describe, expect, it } from 'vitest'

import { hexChainId, parseChainId } from './chain'
import { loadConfig, platformStatus, type RawEnv } from './config'

const FULL: RawEnv = {
  IDENTITY_NAMES_ADDRESS: '0x84ea74d481ee0a5332c457a4d796187f6ba67feb',
  RPC_URL: 'http://127.0.0.1:8545',
  CHAIN_ID: '31337',
  API_URL: 'http://localhost:8722',
  NOTARY_WS_URL: 'http://127.0.0.1:7048',
  X_CLIENT_ID: 'x-client',
  GMAIL_CLIENT_ID: 'g-client.apps.googleusercontent.com',
  GOOGLE_IDENTITY_VERIFIER: '0x8f86403a4de0bb5791fa46b8e795c547942fe4cf',
}

describe('loadConfig', () => {
  it('parses a fully configured environment', () => {
    const c = loadConfig(FULL)
    expect(c.namesAddress).toBe('0x84ea74d481ee0a5332c457a4d796187f6ba67feb')
    expect(c.chainId).toBe(31337)
    expect(c.apiUrl).toBe('http://localhost:8722')
    expect(c.googleVerifier).toBe('0x8f86403a4de0bb5791fa46b8e795c547942fe4cf')
  })

  it('treats empty and whitespace-only values as unset', () => {
    const c = loadConfig({ ...FULL, API_URL: '  ', X_CLIENT_ID: '' })
    expect(c.apiUrl).toBeNull()
    expect(c.xClientId).toBeNull()
  })

  it('rejects malformed addresses instead of passing them through', () => {
    expect(loadConfig({ ...FULL, IDENTITY_NAMES_ADDRESS: '0x123' }).namesAddress).toBeNull()
    expect(loadConfig({ ...FULL, GOOGLE_IDENTITY_VERIFIER: 'nope' }).googleVerifier).toBeNull()
  })

  it('rejects unparsable, zero, and negative chain ids', () => {
    expect(loadConfig({ ...FULL, CHAIN_ID: 'banana' }).chainId).toBeNull()
    expect(loadConfig({ ...FULL, CHAIN_ID: '0' }).chainId).toBeNull()
    expect(loadConfig({ ...FULL, CHAIN_ID: '-5' }).chainId).toBeNull()
    expect(loadConfig({ ...FULL, CHAIN_ID: undefined }).chainId).toBeNull()
  })

  it('defaults only the RPC url', () => {
    const c = loadConfig({})
    expect(c.rpcUrl).toBe('http://127.0.0.1:8545')
    expect(c.namesAddress).toBeNull()
    expect(c.apiUrl).toBeNull()
  })
})

describe('platformStatus', () => {
  it('enables everything when fully configured', () => {
    const s = platformStatus(loadConfig(FULL))
    expect(s.github.unavailable).toBeNull()
    expect(s.x.unavailable).toBeNull()
    expect(s.google.unavailable).toBeNull()
  })

  it('disables only GitHub and Google when the backend is missing', () => {
    const s = platformStatus(loadConfig({ ...FULL, API_URL: undefined }))
    expect(s.github.unavailable).toContain('NEXT_PUBLIC_API_URL')
    expect(s.google.unavailable).toContain('NEXT_PUBLIC_API_URL')
    expect(s.x.unavailable).toBeNull()
  })

  it('disables X without a client id or notary', () => {
    expect(platformStatus(loadConfig({ ...FULL, X_CLIENT_ID: undefined })).x.unavailable).toContain(
      'NEXT_PUBLIC_X_CLIENT_ID',
    )
    expect(
      platformStatus(loadConfig({ ...FULL, NOTARY_WS_URL: undefined })).x.unavailable,
    ).toContain('NEXT_PUBLIC_NOTARY_WS_URL')
  })

  it('names the Google verifier first — the circuit commits it', () => {
    const s = platformStatus(loadConfig({ ...FULL, GOOGLE_IDENTITY_VERIFIER: undefined }))
    expect(s.google.unavailable).toContain('NEXT_PUBLIC_GOOGLE_IDENTITY_VERIFIER')
  })

  it('disables Google without a chain id', () => {
    const s = platformStatus(loadConfig({ ...FULL, CHAIN_ID: undefined }))
    expect(s.google.unavailable).toContain('NEXT_PUBLIC_CHAIN_ID')
    expect(s.github.unavailable).toBeNull()
  })
})

describe('chain-id guards', () => {
  it('round-trips through the provider hex form', () => {
    expect(hexChainId(31337)).toBe('0x7a69')
    expect(parseChainId(hexChainId(31337))).toBe(31337)
    expect(parseChainId(hexChainId(1))).toBe(1)
  })

  it('accepts a bare number from nonconforming providers', () => {
    expect(parseChainId(31337)).toBe(31337)
  })

  it('rejects garbage', () => {
    expect(parseChainId('31337')).toBeNull()
    expect(parseChainId('0xzz')).toBeNull()
    expect(parseChainId(null)).toBeNull()
    expect(parseChainId(-1)).toBeNull()
    expect(parseChainId(1.5)).toBeNull()
  })
})
