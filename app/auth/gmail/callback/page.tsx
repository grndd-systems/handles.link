// Google's relay landing. The id_token arrives in the URL fragment: the
// backend's whitelisted redirect serves a static page that forwards the
// fragment to this origin, and @libid/claim's relay reads it (and erases
// the JWT from the address bar) before posting it to the opener.

import { Relay } from '../../../../components/Relay'

export const metadata = { title: 'Completing sign-in…' }

export default function GmailCallbackPage() {
  return <Relay />
}
