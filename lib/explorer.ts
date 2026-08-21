// The explorer's data source: the usernames-indexer read API. The chain
// can answer "who owns exactly this key", but it cannot enumerate — only
// the indexer, following IdentityNames events, can answer "who matches
// this text" or "what does this wallet hold". Classification and
// response shaping are pure and unit-tested; the fetchers at the bottom
// are the thin network edge.

import type { Address } from 'viem'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

// ── What did the visitor type? ─────────────────────────────────────────────

export type ExplorerQuery =
  | { kind: 'address'; address: Address }
  | { kind: 'name'; text: string }
  | { kind: 'empty' }

/** One box, two lookups: a full 0x address resolves the wallet's
 *  identities; anything else searches names. The server folds case and a
 *  leading @ itself, so the text passes through untouched. */
export function classifyQuery(raw: string): ExplorerQuery {
  const value = raw.trim()
  if (value === '') return { kind: 'empty' }
  if (ADDRESS_RE.test(value)) return { kind: 'address', address: value as Address }
  return { kind: 'name', text: value }
}

// ── Response shapes ────────────────────────────────────────────────────────

/** One `/v1/search` hit. The server ranks exact → prefix → substring →
 *  fuzzy and caps the list, so the order is meaningful — keep it. */
export interface SearchHit {
  platform: string
  handle: string
  owner: Address
  userId: string
  published: boolean
}

/** One identity from `/v1/resolve/address` (the fields the explorer
 *  shows — the wire record carries more). */
export interface AddressIdentity {
  platform: string
  handle: string
  userId: string
  published: boolean
}

/** How far behind the chain the index is, from `/v1/status`. */
export interface IndexStatus {
  lastIndexedBlock: number
  chainHeadBlock: number
  lagBlocks: number
}

/** A structured indexer refusal. `code` is the stable contract — branch
 *  on it, never on the message text. */
export class IndexerError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/** `not_synced`: the indexer has not finished its first pass over the
 *  chain, so the only honest rendering is "catching up" — an empty
 *  result here would be a lie. */
export function isCatchingUp(error: unknown): boolean {
  return error instanceof IndexerError && error.code === 'not_synced'
}

// ── Shaping (pure) ─────────────────────────────────────────────────────────
//
// Defensive by row: one malformed entry is dropped, not thrown — a
// public read API's hiccup should cost one line of results, not the
// page.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** The `{"error":{code,message}}` envelope, or null when the body is not
 *  one. Everything the server refuses arrives in this shape. */
export function parseErrorBody(body: unknown): IndexerError | null {
  if (!isRecord(body) || !isRecord(body.error)) return null
  const { code, message } = body.error
  if (typeof code !== 'string') return null
  return new IndexerError(code, typeof message === 'string' ? message : code)
}

function shapeHit(value: unknown): SearchHit | null {
  if (!isRecord(value)) return null
  const { platform, handle, owner, userId, published } = value
  if (typeof platform !== 'string' || typeof handle !== 'string') return null
  if (typeof owner !== 'string' || !ADDRESS_RE.test(owner)) return null
  return {
    platform,
    handle,
    owner: owner as Address,
    userId: typeof userId === 'string' ? userId : '',
    published: published === true,
  }
}

export function parseSearchBody(body: unknown): SearchHit[] {
  if (!isRecord(body) || !Array.isArray(body.hits)) return []
  return body.hits.map(shapeHit).filter((h): h is SearchHit => h !== null)
}

function shapeIdentity(value: unknown): AddressIdentity | null {
  if (!isRecord(value)) return null
  const { platform, handle, userId, published } = value
  if (typeof platform !== 'string' || typeof handle !== 'string') return null
  return {
    platform,
    handle,
    userId: typeof userId === 'string' ? userId : '',
    published: published === true,
  }
}

export function parseAddressBody(body: unknown): AddressIdentity[] {
  if (!isRecord(body) || !Array.isArray(body.identities)) return []
  return body.identities.map(shapeIdentity).filter((i): i is AddressIdentity => i !== null)
}

export function parseStatusBody(body: unknown): IndexStatus | null {
  if (!isRecord(body)) return null
  const { lastIndexedBlock, chainHeadBlock, lagBlocks } = body
  if (
    typeof lastIndexedBlock !== 'number' ||
    typeof chainHeadBlock !== 'number' ||
    typeof lagBlocks !== 'number'
  ) {
    return null
  }
  return { lastIndexedBlock, chainHeadBlock, lagBlocks }
}

// ── The network edge ───────────────────────────────────────────────────────

async function getJson(base: string, path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${base.replace(/\/+$/, '')}${path}`, { signal })
  // Refusals carry their own status codes but always a JSON envelope;
  // read the body first so a structured error beats a bare "HTTP 503".
  const body: unknown = await response.json().catch(() => null)
  const refusal = parseErrorBody(body)
  if (refusal) throw refusal
  if (!response.ok) throw new Error(`The indexer answered HTTP ${response.status}.`)
  return body
}

export async function searchNames(
  base: string,
  text: string,
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  return parseSearchBody(await getJson(base, `/v1/search?q=${encodeURIComponent(text)}`, signal))
}

export async function resolveAddress(
  base: string,
  address: Address,
  signal?: AbortSignal,
): Promise<AddressIdentity[]> {
  return parseAddressBody(await getJson(base, `/v1/resolve/address/${address}`, signal))
}

export async function indexStatus(base: string, signal?: AbortSignal): Promise<IndexStatus | null> {
  return parseStatusBody(await getJson(base, '/v1/status', signal))
}
