import { describe, expect, it } from 'vitest'

import {
  classifyQuery,
  isCatchingUp,
  parseAddressBody,
  parseErrorBody,
  parseSearchBody,
  parseStatusBody,
} from './explorer'

describe('classifyQuery', () => {
  it('routes a full 0x address to the address lookup', () => {
    const q = classifyQuery('0xB2C7C8eA84932a0dADf8F6f0550cFc89A345540c')
    expect(q).toEqual({ kind: 'address', address: '0xB2C7C8eA84932a0dADf8F6f0550cFc89A345540c' })
  })

  it('trims before classifying', () => {
    expect(classifyQuery('  0xB2C7C8eA84932a0dADf8F6f0550cFc89A345540c  ').kind).toBe('address')
    expect(classifyQuery('  greentoo3  ')).toEqual({ kind: 'name', text: 'greentoo3' })
  })

  it('routes near-addresses to the name search, not the address lookup', () => {
    // Too short, too long, unprefixed: none is an address, all are
    // searchable text — the server decides what they match.
    expect(classifyQuery('0xB2C7C8eA84932a0dADf8F6f0550cFc89A345540').kind).toBe('name')
    expect(classifyQuery('0xB2C7C8eA84932a0dADf8F6f0550cFc89A345540c0').kind).toBe('name')
    expect(classifyQuery('B2C7C8eA84932a0dADf8F6f0550cFc89A345540c').kind).toBe('name')
    expect(classifyQuery('0xZZC7C8eA84932a0dADf8F6f0550cFc89A345540c').kind).toBe('name')
  })

  it('passes @-prefixed and mixed-case text through untouched', () => {
    // The server folds case and the leading @ itself; folding here too
    // would just hide what it does.
    expect(classifyQuery('@Greentoo3')).toEqual({ kind: 'name', text: '@Greentoo3' })
  })

  it('calls whitespace empty', () => {
    expect(classifyQuery('').kind).toBe('empty')
    expect(classifyQuery('   ').kind).toBe('empty')
  })
})

// The fixtures below are captured verbatim from a live usernames-indexer
// (names.testnet.lib.id), trimmed to one row where the rest repeat.

describe('parseSearchBody', () => {
  const wire = {
    query: 'green',
    hits: [
      {
        platform: 'x',
        platformId: '0xc35cd221f653c2881299fd15eafb60135268d945ad58b7bdbceefea1e2274375',
        handle: 'greentoo3',
        owner: '0xB2C7C8eA84932a0dADf8F6f0550cFc89A345540c',
        userId: '1051915704843333634',
        published: true,
      },
    ],
  }

  it('shapes the wire format, keeping the server order', () => {
    expect(parseSearchBody(wire)).toEqual([
      {
        platform: 'x',
        handle: 'greentoo3',
        owner: '0xB2C7C8eA84932a0dADf8F6f0550cFc89A345540c',
        userId: '1051915704843333634',
        published: true,
      },
    ])
  })

  it('drops malformed rows instead of throwing', () => {
    const dirty = {
      hits: [
        wire.hits[0],
        { platform: 'x', handle: 'no-owner' },
        { platform: 'x', handle: 'bad-owner', owner: '0x123' },
        'not even a record',
      ],
    }
    expect(parseSearchBody(dirty)).toHaveLength(1)
  })

  it('reads garbage bodies as empty', () => {
    expect(parseSearchBody(null)).toEqual([])
    expect(parseSearchBody({ hits: 'nope' })).toEqual([])
    expect(parseSearchBody('html error page')).toEqual([])
  })
})

describe('parseAddressBody', () => {
  const wire = {
    address: '0xB2C7C8eA84932a0dADf8F6f0550cFc89A345540c',
    identities: [
      {
        platform: 'github',
        platformId: '0x6e6b76ab962fcaebc5bd2f6ba8868866bc6159e1d6481c3376a7383217a84337',
        userId: '293919812',
        handle: 'testyakly',
        handleNode: '0xdef115fd0e5fa424dff48c212db43a251a9f0c2fc384ff0ae7b510a598d4d733',
        observedAt: 1786585607,
        version: 1,
        resolves: true,
        published: true,
      },
    ],
  }

  it('keeps the fields the explorer shows', () => {
    expect(parseAddressBody(wire)).toEqual([
      { platform: 'github', handle: 'testyakly', userId: '293919812', published: true },
    ])
  })

  it('reads an empty wallet and garbage alike as no identities', () => {
    expect(parseAddressBody({ address: '0x…', identities: [] })).toEqual([])
    expect(parseAddressBody(null)).toEqual([])
  })
})

describe('parseStatusBody', () => {
  it('shapes the freshness numbers', () => {
    const wire = {
      chainId: 3735928814,
      contract: '0xd467D48769c26fAee36BA6b6fC9228F14aeF6Dd2',
      lastIndexedBlock: 239262233,
      chainHeadBlock: 239262238,
      lagBlocks: 5,
      lastWindowError: null,
      indexerVersion: '1',
    }
    expect(parseStatusBody(wire)).toEqual({
      lastIndexedBlock: 239262233,
      chainHeadBlock: 239262238,
      lagBlocks: 5,
    })
  })

  it('returns null rather than a partial status', () => {
    expect(parseStatusBody({ lastIndexedBlock: 1 })).toBeNull()
    expect(parseStatusBody(null)).toBeNull()
  })
})

describe('parseErrorBody', () => {
  it('lifts the envelope into a coded error', () => {
    const e = parseErrorBody({ error: { code: 'invalid_argument', message: 'q must be nonempty' } })
    expect(e?.code).toBe('invalid_argument')
    expect(e?.message).toBe('q must be nonempty')
    expect(isCatchingUp(e)).toBe(false)
  })

  it('recognizes not_synced as catching up — by code, not message', () => {
    const e = parseErrorBody({ error: { code: 'not_synced', message: 'anything at all' } })
    expect(isCatchingUp(e)).toBe(true)
  })

  it('does not mistake success bodies or junk for errors', () => {
    expect(parseErrorBody({ hits: [] })).toBeNull()
    expect(parseErrorBody({ error: 'string form' })).toBeNull()
    expect(parseErrorBody({ error: { message: 'no code' } })).toBeNull()
    expect(parseErrorBody(null)).toBeNull()
  })
})
