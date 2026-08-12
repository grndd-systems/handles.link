'use client'

// The claim, end to end: connect a wallet, sign in to the platform, prove
// control of the account, and bind it on-chain — one transaction from the
// address that will hold the name.

import { proveGitHubClaim, proveGoogleClaim, proveXClaim } from '@libid/claim'
import {
  bindCall,
  PLATFORM_GITHUB_DOMAIN,
  PLATFORM_GOOGLE_DOMAIN,
  PLATFORM_X_DOMAIN,
  platformId,
  resolveId,
  type NamesReader,
} from '@libid/contracts/identity'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPublicClient, http, type PublicClient } from 'viem'

import { appConfig, platformStatus, type PlatformKey } from '../lib/config'
import { useWallet, type Wallet } from '../lib/wallet'

const PLATFORM_META: { key: PlatformKey; label: string; domain: string }[] = [
  { key: 'github', label: 'GitHub', domain: PLATFORM_GITHUB_DOMAIN },
  { key: 'x', label: 'X', domain: PLATFORM_X_DOMAIN },
  { key: 'google', label: 'Google', domain: PLATFORM_GOOGLE_DOMAIN },
]

export function ClaimFlow() {
  const wallet = useWallet()
  const status = useMemo(() => platformStatus(appConfig), [])
  const [platform, setPlatform] = useState<PlatformKey>('github')

  const reader = useMemo<NamesReader | null>(() => {
    if (!appConfig.namesAddress) return null
    return {
      client: createPublicClient({
        transport: http(appConfig.rpcUrl),
      }) as unknown as PublicClient,
      address: appConfig.namesAddress,
    }
  }, [])

  if (!reader) {
    return (
      <section className="card">
        <h2>Claim</h2>
        <p className="muted">
          This deployment is not configured yet: set <code>NEXT_PUBLIC_IDENTITY_NAMES_ADDRESS</code>{' '}
          (and friends — see <code>.env.example</code>) and reload.
        </p>
      </section>
    )
  }

  const selected = PLATFORM_META.find((p) => p.key === platform) ?? PLATFORM_META[0]

  return (
    <section className="card">
      <h2>Claim your handle</h2>

      <div className="row" role="radiogroup" aria-label="Platform">
        {PLATFORM_META.map((p) => {
          const unavailable = status[p.key].unavailable
          return (
            <button
              key={p.key}
              type="button"
              disabled={unavailable !== null}
              title={unavailable ?? undefined}
              onClick={() => setPlatform(p.key)}
              className={p.key === platform ? 'selected' : ''}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {status[selected.key].unavailable ? (
        <p className="muted" style={{ marginTop: '1rem' }}>
          {status[selected.key].unavailable}
        </p>
      ) : (
        <Claim
          key={selected.key}
          platform={selected.key}
          label={selected.label}
          domain={selected.domain}
          reader={reader}
          wallet={wallet}
        />
      )}
    </section>
  )
}

/** Run one platform's prove → bind → verify pipeline. */
async function runClaim(
  platform: PlatformKey,
  holder: `0x${string}`,
  onStatus: (s: string) => void,
  signal: AbortSignal,
): Promise<{ proof: `0x${string}`; handle: string; userId: string }> {
  // The availability gate above already proved these non-null per
  // platform; the assertions here keep TypeScript honest without
  // re-deriving the whole config.
  if (platform === 'google') {
    if (!appConfig.gmailClientId || !appConfig.googleVerifier || !appConfig.apiUrl)
      throw new Error('Google is not configured')
    return proveGoogleClaim(
      holder,
      {
        clientId: appConfig.gmailClientId,
        // Google's whitelist points at the backend, which serves the
        // static relay that forwards the token back to this origin.
        redirectUri: `${appConfig.apiUrl}/auth/gmail/callback`,
        verifyingContract: appConfig.googleVerifier,
        chainId: appConfig.chainId ?? 0,
      },
      onStatus,
      signal,
    )
  }
  if (platform === 'x') {
    if (!appConfig.xClientId || !appConfig.notaryUrl) throw new Error('X is not configured')
    return proveXClaim(
      holder,
      {
        clientId: appConfig.xClientId,
        notaryUrl: appConfig.notaryUrl,
        // The OAuth app registers one redirect and every caller has to
        // name it; app/zk/x-popup serves the relay page.
        redirectUri: `${window.location.origin}/zk/x-popup`,
      },
      onStatus,
      signal,
    )
  }
  if (!appConfig.apiUrl) throw new Error('GitHub is not configured')
  return proveGitHubClaim(holder, appConfig.apiUrl, onStatus, signal)
}

function Claim({
  platform,
  label,
  domain,
  reader,
  wallet,
}: {
  platform: PlatformKey
  label: string
  domain: string
  reader: NamesReader
  wallet: Wallet
}) {
  const id = useMemo(() => platformId(domain), [domain])
  const [status, setStatus] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publish, setPublish] = useState(true)
  const [running, setRunning] = useState(false)
  // Notarizing and proving take minutes with long quiet stretches (X
  // especially), so a running clock is what separates "still working"
  // from "stuck".
  const [elapsed, setElapsed] = useState(0)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!running) return
    const started = Date.now()
    setElapsed(0)
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [running])

  const wrongChain =
    wallet.address !== null &&
    appConfig.chainId !== null &&
    wallet.chainId !== null &&
    wallet.chainId !== appConfig.chainId

  const run = useCallback(async () => {
    if (!wallet.address) return
    const controller = new AbortController()
    abort.current = controller
    setRunning(true)
    setError(null)
    setClaimed(null)
    try {
      const holder = wallet.address
      const result = await runClaim(platform, holder, setStatus, controller.signal)

      setStatus('Waiting for your wallet signature…')
      const hash = await wallet.send(bindCall(reader.address, id, result.proof, publish))
      setStatus(`Sent ${hash.slice(0, 10)}… — confirming`)

      // Read it back rather than trusting the send: a claim that wrote the
      // wrong key would still have produced a receipt.
      const owner = await resolveId(reader, id, result.userId)
      if (owner?.toLowerCase() !== holder.toLowerCase()) {
        throw new Error('The transaction landed, but the name does not resolve to you.')
      }
      setClaimed(result.handle)
      setStatus(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus(null)
    } finally {
      abort.current = null
      setRunning(false)
    }
  }, [platform, id, publish, reader, wallet])

  return (
    <div style={{ marginTop: '1rem' }}>
      {!wallet.address ? (
        <div>
          <button
            type="button"
            className="primary"
            onClick={() => void wallet.connect()}
            disabled={wallet.connecting}
          >
            {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
          </button>
          {!wallet.available && (
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              No wallet detected. The handle is held by whichever address signs the claim, so a
              browser wallet is needed to claim — looking names up needs none.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="muted">
            The handle will be held by <code>{wallet.address}</code>.
          </p>

          {wrongChain && (
            <p className="error">
              Your wallet is on chain {wallet.chainId}, but this deployment lives on chain{' '}
              {appConfig.chainId}.{' '}
              <button
                type="button"
                onClick={() => {
                  if (appConfig.chainId !== null)
                    void wallet.switchChain(appConfig.chainId).catch(() => {})
                }}
              >
                Switch network
              </button>
            </p>
          )}

          <label className="check">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            <span>
              Publish my handle on-chain{' '}
              <span className="muted">
                — published handles are stored and readable in plaintext by anyone; unpublished
                claims still resolve, but only from handle to address.
              </span>
            </span>
          </label>

          <div className="row">
            <button
              type="button"
              className="primary"
              onClick={() => void run()}
              disabled={running || wrongChain}
            >
              {running ? 'Working…' : `Claim my ${label} handle`}
            </button>
            {running && (
              <button type="button" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            )}
          </div>

          {platform === 'x' && !running && (
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              Heads-up: the X proof is notarized and proven in your browser and takes a few minutes.
              Keep the tab open.
            </p>
          )}
        </>
      )}

      {status && (
        <p className="muted" style={{ marginTop: '1rem' }} aria-live="polite">
          {status}
          {running && ` — ${elapsed}s`}
        </p>
      )}
      {claimed && (
        <p className="ok" style={{ marginTop: '1rem' }}>
          <strong>{claimed}</strong> now resolves to your wallet.{' '}
          <Link href="/resolve">Look it up →</Link>
        </p>
      )}
      {(error ?? wallet.error) && <pre className="error">{error ?? wallet.error}</pre>}
    </div>
  )
}
