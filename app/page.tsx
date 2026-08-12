import Link from 'next/link'

import { ClaimFlow } from '../components/ClaimFlow'

export default function HomePage() {
  return (
    <main>
      <header className="site">
        <span className="wordmark">handles.link</span>
        <nav>
          <Link href="/resolve">Resolve</Link>
        </nav>
      </header>

      <h1>Your handle, on-chain.</h1>
      <p className="muted">
        handles.link binds the username you already have — on GitHub, X, or Google — to your wallet.
        You sign in as usual, your browser produces a zkTLS proof that the account is yours, and one
        transaction records the claim on-chain. No platform API keys, no oracles, nothing for anyone
        to take on faith: anyone with an RPC can resolve your handle to your address, or your
        address back to your handle.
      </p>

      <ClaimFlow />

      <footer className="site muted">
        <p>
          Built on{' '}
          <a href="https://github.com/libid-org/libid" rel="noreferrer">
            libID
          </a>
          . Proofs are generated locally in your browser; your credentials never leave it.
        </p>
      </footer>
    </main>
  )
}
