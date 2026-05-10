import type {ReactElement} from 'react';
import {lazy, Suspense} from 'react';
import {HashRouter, Route, Routes} from 'react-router-dom';

const UserDetailPage = lazy(() => import('./views/UserDetailPage'));

export function UserDetailRouter(): ReactElement {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<UserDetailPage />} />
          <Route path="/user/:id" element={<UserDetailPage />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
