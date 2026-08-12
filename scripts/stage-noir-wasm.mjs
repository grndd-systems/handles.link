// Copy noir_js's acvm/abi WASM into public/wasm so @libid/claim's worker
// prover can load them from an explicit same-origin URL. Version-tied to
// the @noir-lang packages that @libid/claim (which declares them — this
// app does not depend on them directly) resolves to in this install;
// scripts/stage-assets.sh runs this after `pnpm install`.
import { copyFileSync, mkdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Resolve through @libid/claim so the staged wasm matches ITS lockfile
// entry, not a hoisted duplicate. realpath first: pnpm links the package
// into node_modules as a symlink, and node's resolver walks up from the
// LITERAL path — which never reaches the .pnpm sibling store.
const require = createRequire(
  realpathSync(join(root, 'node_modules', '@libid', 'claim', 'package.json')),
)
const dest = join(root, 'public/wasm')
mkdirSync(dest, { recursive: true })

/** Package root without consulting its exports map (wasm files are often
 *  not exported subpaths). */
function packageRoot(name) {
  const entry = require.resolve(name)
  const marker = join('node_modules', ...name.split('/'))
  const at = entry.lastIndexOf(marker)
  if (at === -1) throw new Error(`cannot locate ${name} from ${entry}`)
  return entry.slice(0, at + marker.length)
}

const files = [
  ['@noir-lang/acvm_js', 'web/acvm_js_bg.wasm', 'acvm_js_bg.wasm'],
  ['@noir-lang/noirc_abi', 'web/noirc_abi_wasm_bg.wasm', 'noirc_abi_wasm_bg.wasm'],
]
for (const [pkg, rel, name] of files) {
  copyFileSync(join(packageRoot(pkg), rel), join(dest, name))
  console.log(`staged public/wasm/${name}`)
}
