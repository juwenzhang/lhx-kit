# Add a Page

Add a new page to a lhx-kit MPA in one command. **Prefer the CLI over hand
edits** — `lhx-cli add page` uses `ts-morph` to mutate `project.config.ts`
via AST, which preserves comments/formatting and never corrupts adjacent
entries.

## The One Command

```bash
lhx-cli add page <page-name> [options]

# Examples
lhx-cli add page dashboard --title="Dashboard"
lhx-cli add page settings --title="Settings" --router=false   # no React/Vue router
```

Options:
- `--title <string>`       HTML `<title>` of the page (default: capitalised name)
- `--router <bool>`        Whether to scaffold a router (default: true)
- `--template <path>`      Custom page template directory
- `--force`                Overwrite if the page already exists

## What the CLI Does (under the hood)

1. **AST-insert** a new entry into `project.config.ts`:
   ```ts title="project.config.ts (after)"
   pages: {
     home: { /* ... */ },
     dashboard: {                    // ← added
       entry: 'src/pages/dashboard/main.tsx',
       title: 'Dashboard'
     }
   }
   ```
2. **Scaffold the folder** `src/pages/<name>/`:
   ```text
   src/pages/dashboard/
   ├── main.tsx              # entry: createRoot + lazy router
   ├── router.tsx            # route tree, uses React.lazy per view
   ├── views/
   │   ├── Landing.tsx       # default "/" view
   │   └── About.tsx         # "/about"
   └── components/           # page-local components
   ```
3. **Pre-wire lazy loading** so per-view chunks stay tiny and merged by
   `experimentalMinChunkSize = 10KB` at build time.

## Manual Alternative (only if CLI is unavailable)

```ts title="project.config.ts"
export default defineProjectConfig({
  pages: {
    // ... existing pages
    dashboard: {
      entry: 'src/pages/dashboard/main.tsx',
      title: 'Dashboard'
    }
  }
});
```

Then create `src/pages/dashboard/main.tsx` with a minimal entry:

```tsx title="src/pages/dashboard/main.tsx"
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Router} from './router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router />
  </StrictMode>
);
```

## Pitfalls

:::warning Never edit project.config.ts with regex
String-based find/replace breaks when comments, trailing commas, or spread
operators are present. The CLI uses `ts-morph` AST for a reason.
:::

:::tip Per-page chunking is automatic
Do NOT add the new page to any manualChunks config. The Vite plugin wires
per-page inputs and splits vendor chunks automatically.
:::

:::info Page names must be kebab-case
Match `[a-z][a-z0-9-]*`. Uppercase or snake_case will fail validation.
:::

## Validation After Adding

```bash
lhx-cli doctor       # verifies new page is wired correctly
pnpm build           # dist/dashboard/ should appear with its own index.html
```

## Common Follow-ups After Adding

- Add offline prefetch for the new page: append `'dashboard'` to
  `offline.config.ts` → `whitelistPages`.
- Protect behind auth: import `guard` from `@lhx-kit/runtime` and wrap the
  root component.
- Add mock API: drop a handler into `src/mocks/handlers.ts`.
