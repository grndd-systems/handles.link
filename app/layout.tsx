import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: 'handles.link — your handle, on-chain',
  description:
    'Claim your GitHub, X, or Google handle on-chain. Verified with zkTLS, held by your wallet, resolvable by anyone.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
