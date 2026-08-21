import Link from 'next/link'

import { ExplorerView } from '../../components/ExplorerView'

export const metadata = { title: 'Explore — handles.link' }

export default function ExplorerPage() {
  return (
    <main>
      <header className="site">
        <Link href="/" className="wordmark">
          handles.link
        </Link>
        <nav>
          <Link href="/">Claim</Link>
          <Link href="/resolve">Resolve</Link>
        </nav>
      </header>

      <h1>Explore the names</h1>
      <p className="muted">
        Type a handle — or any part of one — to find who claimed it, or paste a 0x address to see
        every identity it holds. The explorer reads the name index, so partial matches work and no
        wallet is needed; the <Link href="/resolve">resolve page</Link> answers the same questions
        straight from the chain.
      </p>

      <ExplorerView />
    </main>
  )
}
