# handles.link

Your platform handle, on-chain. Connect a wallet, sign in to GitHub, X, or
Google, and your browser produces a zkTLS proof that the account is yours;
one transaction binds the handle to your address in the `IdentityNames`
contract. Anyone with an RPC can then resolve handle → address or
address → published handle — no platform APIs, no oracles.

Built on the published [libID](https://github.com/libid-org/libid)
packages: [`@libid/claim`](https://www.npmjs.com/package/@libid/claim)
(the browser claim flows) and
[`@libid/contracts`](https://www.npmjs.com/package/@libid/contracts)
(bind calldata + resolvers).

## Layout

- `app/` — Next.js app router: the landing/claim page, `/resolve`, and the
  two OAuth relay routes (`/zk/x-popup` for X, `/auth/gmail/callback` for
  Google) that bounce the provider callback to the opener on
  `@libid/claim`'s link channel.
- `components/` — the claim flow, the resolve view, the relay page.
- `lib/` — config parsing + platform enablement (pure, unit-tested) and
  the wallet hook (connect, chain guard with `wallet_switchEthereumChain`,
  send).
- `scripts/stage-assets.sh` — fetches the static proving assets into
  `public/` (gitignored). GitHub claims need none; X needs the tlsn wasm
  bundle + token circuit; Google needs the jwt circuit + noir/OIDC wasm.
  The OIDC wasm is still built from a libid checkout (`LIBID_REPO=…`) —
  a TODO until libid ships it as a release asset.
- `next.config.ts` — the load-bearing headers: COOP `same-origin` + COEP
  `require-corp` on every route (SharedArrayBuffer for multithreaded
  proving), a CSP whose `worker-src`/`connect-src` the provers need, and
  the `/:path+/spawn.js → /spawn.js` rewrite for tlsn's worker loader.

## Configuration

Everything is `NEXT_PUBLIC_*`; see [.env.example](.env.example) for the
full commented list. A missing platform-specific variable disables that
platform's button (with the reason as its tooltip) — it never crashes the
app. GitHub needs only the backend; X adds the notary + client id; Google
adds its client id + verifier contract.

## Run locally

Against the libid integration harness (anvil + deployed contracts +
released notary/identity-backend images):

```sh
# 1. In a libid checkout: boot the stack (and keep it running).
git clone https://github.com/libid-org/libid && cd libid
harness/boot.sh          # KEEP_STACK=1 to leave it up when you exit

# 2. Here: stage the proving assets (GitHub-only? skip this).
pnpm install
LIBID_REPO=../libid pnpm stage-assets

# 3. Point .env.local at the harness — the values are exactly the ones
#    harness/render-env.sh writes (copy them from the libid checkout's
#    ts/apps/demo/.env.local, s/VITE_/NEXT_PUBLIC_/):
cp .env.example .env.local   # the committed defaults ARE the harness values

# 4. Dev server.
pnpm dev                 # http://localhost:3000
```

The harness registers its own local OAuth stand-ins for GitHub; X and
Google against real providers additionally need real client ids whose
registered redirects point at this origin (X) / the backend (Google).

## Development

```sh
pnpm build       # next build
pnpm test        # vitest — the pure units in lib/
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome
pnpm fmt         # biome format --write
```

CI (`.github/workflows/ci.yml`) runs install → lint/format → typecheck →
build → tests, plus the DCO check; actions are SHA-pinned.

## License

MIT OR Apache-2.0, like the rest of the stack. See `LICENSE-MIT` and
`LICENSE-APACHE`.
