import type {ReactElement} from 'react';
import {lazy, Suspense} from 'react';
import {HashRouter, Route, Routes} from 'react-router-dom';

const HomeLanding = lazy(() => import('./views/HomeLanding'));

export function HomeRouter(): ReactElement {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomeLanding />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
