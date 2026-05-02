import type {ReactElement} from 'react';
import {lazy, Suspense} from 'react';
import {HashRouter, Route, Routes} from 'react-router-dom';

const DashboardLanding = lazy(() => import('./views/DashboardLanding'));
const DashboardAbout = lazy(() => import('./views/DashboardAbout'));

/**
 * Router scoped to the "dashboard" MPA page. HashRouter keeps this page
 * self-contained — no server-side URL rewrites required.
 */
export function DashboardRouter(): ReactElement {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<DashboardLanding />} />
          <Route path="/about" element={<DashboardAbout />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
