import type {ReactElement} from 'react';

export default function HomeLanding(): ReactElement {
  return (
    <main style={{padding: '2rem', fontFamily: 'system-ui, sans-serif'}}>
      <h1>business-smoke</h1>
      <p>
        Full-stack monorepo — edit <code>apps/web/src/pages/home/views/HomeLanding.tsx</code> to get
        started.
      </p>
      <ul style={{marginTop: '1rem', lineHeight: 2}}>
        <li>
          API: <code>apps/api</code> (Express + TypeScript + pg + redis)
        </li>
        <li>
          Web: <code>apps/web</code> (lhx-kit MPA + React 19)
        </li>
        <li>
          Types: <code>packages/types</code> (shared TypeScript contracts)
        </li>
        <li>
          Utils: <code>packages/utils</code> (shared helper functions)
        </li>
      </ul>
    </main>
  );
}
