'use client'

// Search-as-you-type over every claimed name. One box, classified as it
// is typed: a full 0x address shows the wallet's identities across
// platforms, anything else searches handles — exact, prefix, substring,
// fuzzy, in that order, because the indexer ranks that way. Reading the
// indexer instead of the chain is what makes partial matches possible;
// no wallet or RPC is involved.

import { useEffect, useState } from 'react'
import type { Address } from 'viem'

import { appConfig } from '../lib/config'
import {
  classifyQuery,
  indexStatus,
  isCatchingUp,
  resolveAddress,
  searchNames,
  type AddressIdentity,
  type IndexStatus,
  type SearchHit,
} from '../lib/explorer'

const PLATFORM_LABEL: Record<string, string> = {
  github: 'GitHub',
  x: 'X',
  google: 'Google',
}

type Results =
  | { state: 'idle' }
  | { state: 'names'; hits: SearchHit[] }
  | { state: 'address'; address: Address; identities: AddressIdentity[] }
  | { state: 'catching-up' }
  | { state: 'error'; message: string }

export function ExplorerView() {
  const base = appConfig.namesApiUrl
  if (!base) {
    return (
      <section className="card">
        <h2>Search</h2>
        <p className="muted">
          This deployment is not configured yet: set <code>NEXT_PUBLIC_NAMES_API_URL</code> to a
          usernames-indexer origin and reload. On-chain lookups still work on the resolve page.
        </p>
      </section>
    )
  }
  return <Explorer base={base} />
}

function Explorer({ base }: { base: string }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Results>({ state: 'idle' })
  const [status, setStatus] = useState<IndexStatus | null>(null)

  // The freshness note: one best-effort status read on mount. When it
  // fails the note simply does not render — freshness is a nicety, not
  // a gate.
  useEffect(() => {
    const controller = new AbortController()
    indexStatus(base, controller.signal)
      .then(setStatus)
      .catch(() => {})
    return () => controller.abort()
  }, [base])

  useEffect(() => {
    const query = classifyQuery(input)
    if (query.kind === 'empty') {
      setBusy(false)
      setResults({ state: 'idle' })
      return
    }
    setBusy(true)
    // Debounced as-you-type: the timer collapses a burst of keystrokes,
    // the controller cancels a stale in-flight request, and the cleanup
    // covers both — so no answer can land out of order.
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (query.kind === 'address') {
            const identities = await resolveAddress(base, query.address, controller.signal)
            setResults({ state: 'address', address: query.address, identities })
          } else {
            const hits = await searchNames(base, query.text, controller.signal)
            setResults({ state: 'names', hits })
          }
          setBusy(false)
        } catch (e) {
          if (controller.signal.aborted) return
          setResults(
            isCatchingUp(e)
              ? { state: 'catching-up' }
              : { state: 'error', message: e instanceof Error ? e.message : String(e) },
          )
          setBusy(false)
        }
      })()
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [base, input])

  return (
    <section className="card">
      <h2>Search</h2>
      <div className="row">
        <input
          type="text"
          placeholder="handle, part of one, or 0x address"
          aria-label="Handle or address"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>
      <div aria-live="polite">
        {busy && results.state === 'idle' && (
          <p className="muted" style={{ marginTop: '1rem' }}>
            Searching…
          </p>
        )}
        <ResultsView results={results} onOwner={setInput} />
      </div>
      {status && (
        <p className="muted freshness">
          Index at block {status.lastIndexedBlock}
          {status.lagBlocks > 0
            ? `, ${status.lagBlocks} ${status.lagBlocks === 1 ? 'block' : 'blocks'} behind the chain head.`
            : ' — caught up with the chain head.'}
        </p>
      )}
    </section>
  )
}

function ResultsView({ results, onOwner }: { results: Results; onOwner: (a: Address) => void }) {
  switch (results.state) {
    case 'idle':
      return null
    case 'catching-up':
      return (
        <p className="muted" style={{ marginTop: '1rem' }}>
          The index is still catching up with the chain — try again in a moment.
        </p>
      )
    case 'error':
      return <pre className="error">{results.message}</pre>
    case 'names':
      if (results.hits.length === 0) {
        return (
          <p className="muted" style={{ marginTop: '1rem' }}>
            Nothing matches that yet.
          </p>
        )
      }
      return (
        <ul className="hits">
          {results.hits.map((hit) => (
            <li key={`${hit.platform}:${hit.userId || hit.handle}`} className="hit">
              <Identity
                platform={hit.platform}
                handle={hit.handle}
                published={hit.published}
                userId={hit.userId}
              />
              {/* The owner is itself a query: one click pivots to
                  everything that wallet holds. */}
              <button
                type="button"
                className="bare owner"
                title={`All identities held by ${hit.owner}`}
                onClick={() => onOwner(hit.owner)}
              >
                {shortAddress(hit.owner)}
              </button>
            </li>
          ))}
        </ul>
      )
    case 'address':
      return (
        <div style={{ marginTop: '1rem' }}>
          <p className="muted">
            Identities held by <code>{results.address}</code>:
          </p>
          {results.identities.length === 0 ? (
            <p className="muted">None yet — that address has not claimed a handle here.</p>
          ) : (
            <ul className="hits">
              {results.identities.map((id) => (
                <li key={`${id.platform}:${id.userId || id.handle}`} className="hit">
                  <Identity
                    platform={id.platform}
                    handle={id.handle}
                    published={id.published}
                    userId={id.userId}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )
  }
}

/** The shared row core: platform badge, handle, published state. */
function Identity({
  platform,
  handle,
  published,
  userId,
}: {
  platform: string
  handle: string
  published: boolean
  userId: string
}) {
  return (
    <>
      <span className="badge">{PLATFORM_LABEL[platform] ?? platform}</span>
      <strong title={userId ? `account id ${userId}` : undefined}>{handle}</strong>
      {published ? (
        <span className="ok tag">published</span>
      ) : (
        <span className="muted tag">unpublished</span>
      )}
    </>
  )
}

function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
