/**
 * Headless renderer smoke test. Validates:
 *   - schema parsing
 *   - variant selection
 *   - schema merge (append / patchProps)
 *   - walker for (loop), when (condition), $ path lookup
 *   - remote fetch fallback
 * No framework required: we render through the walker and print the tree.
 */
import {
  createRegistry,
  fetchRemoteSchema,
  mergeSchema,
  pageSchema,
  resolveVariant,
  walkComponents
} from '@lhx-kit/renderer';
import {readFileSync} from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('./src/schemas/home.json', import.meta.url), 'utf8'));
const base = pageSchema.parse(raw);

const variants = [
  {
    when: {eq: [{$: 'flags.isReview'}, true]},
    use: base,
    with: [
      {op: 'patchProps', target: {id: 'page-title'}, value: {text: '(Review Mode) Renderer'}}
    ]
  },
  {use: base}
];

async function run() {
  for (const review of [false, true]) {
    const ctx = {state: {items: [{label: 'A'}, {label: 'B'}, {label: 'C'}]}, flags: {isReview: review}};
    const picked = resolveVariant(variants, ctx);
    if (!picked) throw new Error('variant resolution failed');
    let merged = mergeSchema(picked.base, picked.patches);

    // Emulate remote fetch: the URL intentionally fails, so fallback is used.
    merged = await fetchRemoteSchema({
      url: 'http://127.0.0.1:1/does-not-exist',
      fallback: merged,
      timeout: 200,
      cache: 'no-store'
    });

    const nodes = walkComponents(merged.components, ctx);
    console.log(`\n=== review=${review} ===`);
    print(nodes, '');
  }
}

function print(nodes, indent) {
  for (const n of nodes) {
    const label = `${indent}${n.name}${n.source.id ? '#' + n.source.id : ''}`;
    const propStr = Object.keys(n.props).length ? ' ' + JSON.stringify(n.props) : '';
    console.log(label + propStr);
    print(n.children, indent + '  ');
    for (const [slot, children] of Object.entries(n.slots)) {
      console.log(indent + '  [slot:' + slot + ']');
      print(children, indent + '    ');
    }
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
