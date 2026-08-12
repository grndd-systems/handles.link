import type { NextConfig } from 'next'

// The identity-backend origin goes into CSP connect-src (handles bare
// http://ip:port forms). Everything else the flows talk to is covered by
// the scheme-level sources below.
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
const apiOrigin = apiUrl ? new URL(apiUrl).origin : ''

const nextConfig: NextConfig = {
  devIndicators: false,
  // bb.js / noir_js are imported only on the client (dynamic `import()`
  // inside @libid/claim's X and OIDC provers), but their package shapes
  // pull in `worker_threads` and other Node-only deps that crash the Node
  // File Trace. Mark them external on the server side so NFT skips them.
  serverExternalPackages: [
    '@aztec/bb.js',
    '@noir-lang/noir_js',
    '@noir-lang/noirc_abi',
    '@noir-lang/acvm_js',
  ],
  // WASM support for @aztec/bb.js and @noir-lang/noir_js (webpack build).
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true }
    if (!isServer) {
      config.output = {
        ...config.output,
        webassemblyModuleFilename: 'static/wasm/[modulehash].wasm',
      }
    }
    return config
  },
  // Turbopack handles WASM natively — empty config suppresses the mismatch warning.
  turbopack: {},

  rewrites: async () => [
    // public/tlsn_wasm.js requests its worker at a build-hashed path,
    // snippets/web-spawn-<hash>/js/spawn.js, because wasm-pack emits the
    // loader with an empty public path so the URL resolves against the
    // current page. This maps any such request onto the single staged copy
    // at the root, which is why no snippets/ tree has to be mirrored and
    // why the hash never has to be written down anywhere.
    { source: '/:path+/spawn.js', destination: '/spawn.js' },
  ],

  headers: async () => {
    const connectSrc = [
      "'self'",
      'https:',
      'http://localhost:*',
      'http://127.0.0.1:*',
      // WebSocket schemes need their OWN entries — a `ws:`/`wss:` URL is
      // not matched by the `http:`/`https:` sources above, so the notary
      // connection is only allowed if its scheme is listed here. The two
      // `ws://` lines cover local dev; `wss:` is the same allowance for
      // every deployed environment, and without it the X flow dies at
      // "Notarizing" with a bare "WebSocket failed to connect".
      'ws://localhost:*',
      'ws://127.0.0.1:*',
      'wss:',
      // bb.js inlines the gzipped UltraHonk WASM as a data: URL and
      // `fetch()`es it on init. Without `data:` in connect-src, proving
      // fails before it even starts.
      'data:',
      'blob:',
      ...(apiOrigin ? [apiOrigin] : []),
    ].join(' ')

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // bb.js spawns the UltraHonk prover from a blob:-URL Worker.
              // Without an explicit worker-src, CSP falls back to
              // script-src (which lacks `blob:`) and proving silently dies.
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              `connect-src ${connectSrc}`,
              "font-src 'self'",
              // base-uri/form-action do not inherit default-src; pin them.
              "object-src 'none'",
              "base-uri 'none'",
              "form-action 'none'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Required for SharedArrayBuffer (multi-threaded WASM proving) on
          // every route: the X and Google provers run at the origin root,
          // and COOP/COEP only take effect when the whole browsing context
          // is isolated.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ]
  },
}

export default nextConfig
