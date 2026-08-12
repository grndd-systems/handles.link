'use client'

// The popup side of the claim flows: a pure provider-callback bounce.
// Both provider callbacks land here (X with a code in the query, Google
// with an id_token in the fragment via the backend's static relay); the
// jobId in `state` routes the payload back to the opener on the
// libid_link channel, and the window closes itself once acked.

import { startRelay } from '@libid/claim'
import { useEffect, useRef } from 'react'

export function Relay() {
  const status = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (status.current) startRelay(status.current)
  }, [])

  return (
    <main>
      <p ref={status} className="muted">
        Completing sign-in…
      </p>
    </main>
  )
}
