import {createRoot} from 'react-dom/client';
import {DashboardRouter} from './router';
import {bootstrap} from '@/bootstrap';

void bootstrap().then(() => {
  const root = document.getElementById('app');
  if (root) createRoot(root).render(<DashboardRouter />);
});
