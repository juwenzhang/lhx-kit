import {createRoot} from 'react-dom/client';
import {bootstrap} from '@/bootstrap';
import {HomeRouter} from './router';

void bootstrap().then(() => {
  const root = document.getElementById('app');
  if (root) createRoot(root).render(<HomeRouter />);
});
