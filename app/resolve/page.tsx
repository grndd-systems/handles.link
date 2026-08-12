import Link from 'next/link'

import { ResolveView } from '../../components/ResolveView'

export const metadata = { title: 'Resolve — handles.link' }

export default function ResolvePage() {
  return (
    <main>
      <header className="site">
        <Link href="/" className="wordmark">
          handles.link
        </Link>
        <nav>
          <Link href="/">Claim</Link>
        </nav>
      </header>

      <h1>Look a handle up</h1>
      <p className="muted">
        Pick the platform, then paste a handle to find the wallet that claimed it — or paste a 0x
        address to find its published handle. Reading is free and needs no wallet.
      </p>

      <ResolveView />
    </main>
  )
}
