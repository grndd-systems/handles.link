'use client'

// The app's signer: `window.ethereum` through @libid/claim's wallet
// helpers. The React hook lives here, not in the library — the library is
// framework-free and this file is the few lines a consumer writes on top.
//
// On top of the demo-shaped hook this one tracks the provider's chain:
// a claim's bind transaction must land on the chain the proof (and the
// IdentityNames deployment) is for, so the page surfaces a mismatch and
// offers wallet_switchEthereumChain instead of sending a doomed tx.

import {
  connectedAccount,
  injectedProvider,
  requestAccount,
  sendInjectedCall,
  watchAccount,
} from '@libid/claim'
import { useCallback, useEffect, useState } from 'react'
import type { Address, Hex } from 'viem'

import { hexChainId, parseChainId } from './chain'

export interface Wallet {
  /** Null until connected. Everything on the page that writes needs it. */
  address: Address | null
  /** The provider's current chain, null until known. */
  chainId: number | null
  available: boolean
  connecting: boolean
  error: string | null
  connect: () => Promise<void>
  /** Ask the wallet to switch to `id` (wallet_switchEthereumChain). */
  switchChain: (id: number) => Promise<void>
  /** Send one call and return its hash. Throws if nothing is connected. */
  send: (call: { to: Address; data: Hex }) => Promise<Hex>
}

export function useWallet(): Wallet {
  const [address, setAddress] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [available, setAvailable] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const provider = injectedProvider()
    setAvailable(provider !== null)
    if (!provider) return

    // Already-authorized accounts, without prompting.
    void connectedAccount(provider)
      .then((first) => {
        if (first) setAddress(first)
      })
      .catch(() => {})

    void provider
      .request({ method: 'eth_chainId' })
      .then((id) => setChainId(parseChainId(id)))
      .catch(() => {})

    const onChain = (...args: unknown[]) => setChainId(parseChainId(args[0]))
    provider.on?.('chainChanged', onChain)

    // A claim is made out to ONE address. If the user switches accounts
    // mid-flow the proof in hand names the old one, so the page must
    // notice rather than send a transaction that reverts NotProofTarget.
    const unwatch = watchAccount(provider, setAddress)
    return () => {
      unwatch()
      provider.removeListener?.('chainChanged', onChain)
    }
  }, [])

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      const provider = injectedProvider()
      if (!provider) {
        setError('No injected wallet found. Install one (e.g. MetaMask or Rabby) to claim.')
        return
      }
      setAddress(await requestAccount(provider))
      setChainId(parseChainId(await provider.request({ method: 'eth_chainId' })))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setConnecting(false)
    }
  }, [])

  const switchChain = useCallback(async (id: number) => {
    const provider = injectedProvider()
    if (!provider) throw new Error('The injected wallet disappeared')
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId(id) }],
    })
    // chainChanged fires too, but read it back so the UI settles even on
    // providers that skip the event after a programmatic switch.
    setChainId(parseChainId(await provider.request({ method: 'eth_chainId' })))
  }, [])

  const send = useCallback(
    async (call: { to: Address; data: Hex }): Promise<Hex> => {
      if (!address) throw new Error('No wallet connected')
      const provider = injectedProvider()
      if (!provider) throw new Error('The injected wallet disappeared')
      return sendInjectedCall(provider, address, call)
    },
    [address],
  )

  return { address, chainId, available, connecting, error, connect, switchChain, send }
}
