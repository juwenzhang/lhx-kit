import type {ReactElement} from 'react';
import {lazy, Suspense} from 'react';
import {HashRouter, Route, Routes} from 'react-router-dom';

/**
 * Router scoped to the "home" MPA page.
 *
 * Each MPA page has its own HTML entry and its own router — they don't share
 * routing state. Use hash history by default so individual pages never need
 * server-side URL rewrites. Swap to `BrowserRouter` if you configure the
 * server to fall back to this page's `index.html`.
 */
const HomeLanding = lazy(() => import('./views/HomeLanding'));
const HomeAbout = lazy(() => import('./views/HomeAbout'));

export function HomeRouter(): ReactElement {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomeLanding />} />
          <Route path="/about" element={<HomeAbout />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
