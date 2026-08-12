// Chain-id plumbing for the wallet guard. Pure so the parsing is testable:
// providers speak 0x-hex over `eth_chainId` / `chainChanged`, the config
// speaks decimal.

export function hexChainId(id: number): `0x${string}` {
  return `0x${id.toString(16)}`
}

/** Provider-reported chain id (hex string, occasionally already a number)
 *  to a decimal number, or null when it is not a chain id at all. */
export function parseChainId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }
  if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) {
    const parsed = Number.parseInt(value, 16)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
  }
  return null
}
