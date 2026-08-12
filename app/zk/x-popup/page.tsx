// X's registered OAuth redirect. The relay is path-agnostic (the jobId in
// `state` routes the payload), but the OAuth app registers exactly this
// URL, so the route exists under the name the consent screen sends back.

import { Relay } from '../../../components/Relay'

export const metadata = { title: 'Completing sign-in…' }

export default function XPopupPage() {
  return <Relay />
}
