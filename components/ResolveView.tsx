'use client'

// Reading needs no wallet at all — a name resolves for anyone with an RPC,
// which is the point of the thing. An address looks up its published
// handle; a handle (or raw account id) looks up its owner.

import {
  PLATFORM_GITHUB_DOMAIN,
  PLATFORM_GOOGLE_DOMAIN,
  PLATFORM_X_DOMAIN,
  platformId,
  primaryName,
  resolveHandle,
  resolveId,
  type NamesReader,
} from '@libid/contracts/identity'
import { useCallback, useMemo, useState } from 'react'
import { createPublicClient, http, type Address, type PublicClient } from 'viem'

import { appConfig, type PlatformKey } from '../lib/config'

const PLATFORM_META: { key: PlatformKey; label: string; domain: string }[] = [
  { key: 'github', label: 'GitHub', domain: PLATFORM_GITHUB_DOMAIN },
  { key: 'x', label: 'X', domain: PLATFORM_X_DOMAIN },
  { key: 'google', label: 'Google', domain: PLATFORM_GOOGLE_DOMAIN },
]

export function ResolveView() {
  const [platform, setPlatform] = useState<PlatformKey>('github')
  const [query, setQuery] = useState('')
  const [out, setOut] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reader = useMemo<NamesReader | null>(() => {
    if (!appConfig.namesAddress) return null
    return {
      client: createPublicClient({
        transport: http(appConfig.rpcUrl),
      }) as unknown as PublicClient,
      address: appConfig.namesAddress,
    }
  }, [])

  const selected = PLATFORM_META.find((p) => p.key === platform) ?? PLATFORM_META[0]
  const id = useMemo(() => platformId(selected.domain), [selected.domain])

  const run = useCallback(async () => {
    if (!reader) return
    const value = query.trim()
    if (!value) return
    setBusy(true)
    try {
      // An address looks up a name; anything else is a handle or an id,
      // and both are worth trying — a caller rarely knows which one they
      // hold.
      if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
        const name = await primaryName(reader, value as Address, id)
        setOut(name ? `${value} published ${name}` : 'That address has no published handle here.')
        return
      }
      const byHandle = await resolveHandle(reader, id, value)
      if (byHandle) {
        setOut(`${value} → ${byHandle}`)
        return
      }
      const byId = await resolveId(reader, id, value)
      setOut(byId ? `id ${value} → ${byId}` : 'Nobody has claimed that yet.')
    } catch (e) {
      // An unconfigured platform reverts rather than answering "nobody",
      // which is the distinction worth surfacing.
      setOut(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [reader, id, query])

  if (!reader) {
    return (
      <section className="card">
        <h2>Resolve</h2>
        <p className="muted">
          This deployment is not configured yet: set <code>NEXT_PUBLIC_IDENTITY_NAMES_ADDRESS</code>{' '}
          and reload.
        </p>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Resolve</h2>
      <div className="row" role="radiogroup" aria-label="Platform" style={{ marginBottom: '1rem' }}>
        {PLATFORM_META.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPlatform(p.key)}
            className={p.key === platform ? 'selected' : ''}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="row">
        <input
          type="text"
          placeholder="handle, account id, or 0x address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run()}
        />
        <button type="button" className="primary" onClick={() => void run()} disabled={busy}>
          {busy ? 'Looking…' : 'Look up'}
        </button>
      </div>
      {out && <pre style={{ marginTop: '1rem' }}>{out}</pre>}
    </section>
  )
}
