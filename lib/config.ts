// Configuration, in two layers.
//
// `readEnv()` is the only place that touches `process.env`, and it names
// every NEXT_PUBLIC_ variable literally — Next.js inlines them into the
// client bundle by static reference, so a dynamic lookup would read
// undefined in the browser. Everything downstream (`loadConfig`,
// `platformStatus`) is pure over a plain record and unit-tested.

import type { Address } from 'viem'

export interface RawEnv {
  IDENTITY_NAMES_ADDRESS?: string
  RPC_URL?: string
  CHAIN_ID?: string
  API_URL?: string
  NOTARY_WS_URL?: string
  X_CLIENT_ID?: string
  GMAIL_CLIENT_ID?: string
  GOOGLE_IDENTITY_VERIFIER?: string
}

export interface AppConfig {
  /** IdentityNames contract. Null means the app cannot run at all. */
  namesAddress: Address | null
  rpcUrl: string
  /** NaN-free: null when unset or unparsable. */
  chainId: number | null
  /** identity-backend origin (GitHub flow + Google fragment relay). */
  apiUrl: string | null
  notaryUrl: string | null
  xClientId: string | null
  gmailClientId: string | null
  googleVerifier: Address | null
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

function address(value: string | undefined): Address | null {
  const v = value?.trim() ?? ''
  return ADDRESS_RE.test(v) ? (v as Address) : null
}

function text(value: string | undefined): string | null {
  const v = value?.trim() ?? ''
  return v === '' ? null : v
}

export function loadConfig(env: RawEnv): AppConfig {
  const chainRaw = text(env.CHAIN_ID)
  const chainId = chainRaw === null ? null : Number(chainRaw)
  return {
    namesAddress: address(env.IDENTITY_NAMES_ADDRESS),
    rpcUrl: text(env.RPC_URL) ?? 'http://127.0.0.1:8545',
    chainId: chainId !== null && Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null,
    apiUrl: text(env.API_URL),
    notaryUrl: text(env.NOTARY_WS_URL),
    xClientId: text(env.X_CLIENT_ID),
    gmailClientId: text(env.GMAIL_CLIENT_ID),
    googleVerifier: address(env.GOOGLE_IDENTITY_VERIFIER),
  }
}

export type PlatformKey = 'github' | 'x' | 'google'

export interface PlatformStatus {
  key: PlatformKey
  /** Null when the flow is fully configured; a sentence naming the missing
   *  variable(s) when it is not. Shown as the disabled button's tooltip. */
  unavailable: string | null
}

/** Which platforms this deployment can actually claim, and why not.
 *  A missing variable disables one platform's button — it never crashes
 *  the app or hides the others. */
export function platformStatus(config: AppConfig): Record<PlatformKey, PlatformStatus> {
  return {
    github: {
      key: 'github',
      unavailable: config.apiUrl
        ? null
        : 'Set NEXT_PUBLIC_API_URL — the GitHub flow runs through the identity-backend.',
    },
    x: {
      key: 'x',
      unavailable: !config.xClientId
        ? 'Set NEXT_PUBLIC_X_CLIENT_ID — the OAuth consent needs it.'
        : !config.notaryUrl
          ? 'Set NEXT_PUBLIC_NOTARY_WS_URL — the X proof is notarized.'
          : null,
    },
    google: {
      key: 'google',
      // The circuit commits the contract that will verify (and the chain
      // id), so both have to be known before the token is minted; the
      // redirect is whitelisted at the backend, which serves the relay.
      unavailable: !config.googleVerifier
        ? 'Set NEXT_PUBLIC_GOOGLE_IDENTITY_VERIFIER — the token is minted for it.'
        : !config.gmailClientId
          ? 'Set NEXT_PUBLIC_GMAIL_CLIENT_ID — the OAuth consent needs it.'
          : !config.apiUrl
            ? 'Set NEXT_PUBLIC_API_URL — Google redirects through the backend relay.'
            : config.chainId === null
              ? 'Set NEXT_PUBLIC_CHAIN_ID — the circuit commits it.'
              : null,
    },
  }
}

/** The literal NEXT_PUBLIC_ references (see the header note). */
export function readEnv(): RawEnv {
  return {
    IDENTITY_NAMES_ADDRESS: process.env.NEXT_PUBLIC_IDENTITY_NAMES_ADDRESS,
    RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
    CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
    API_URL: process.env.NEXT_PUBLIC_API_URL,
    NOTARY_WS_URL: process.env.NEXT_PUBLIC_NOTARY_WS_URL,
    X_CLIENT_ID: process.env.NEXT_PUBLIC_X_CLIENT_ID,
    GMAIL_CLIENT_ID: process.env.NEXT_PUBLIC_GMAIL_CLIENT_ID,
    GOOGLE_IDENTITY_VERIFIER: process.env.NEXT_PUBLIC_GOOGLE_IDENTITY_VERIFIER,
  }
}

export const appConfig: AppConfig = loadConfig(readEnv())
