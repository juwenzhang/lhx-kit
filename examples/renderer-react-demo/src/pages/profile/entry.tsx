import {createRoot} from 'react-dom/client';
import {createConfiguredPage} from '@lhx-kit/renderer/react';
import {createRegistry} from '@lhx-kit/renderer';
import schema from '@/schemas/profile.json';
import {Heading} from '@/components/Heading';
import {Card} from '@/components/Card';
import {Paragraph} from '@/components/Paragraph';

const registry = createRegistry<typeof Heading | typeof Card | typeof Paragraph>();
registry.registerAll({
  Heading: () => Heading,
  Card: () => Card,
  Paragraph: () => Paragraph
});

const Page = createConfiguredPage({
  schema: schema as unknown as Parameters<typeof createConfiguredPage>[0]['schema'],
  registry: registry as unknown as Parameters<typeof createConfiguredPage>[0]['registry'],
  state: {
    user: {
      name: 'Alice',
      level: 12,
      skills: [{name: 'TypeScript'}, {name: 'React 19'}, {name: 'Vite'}]
    }
  },
  flags: {
    isVip: new URLSearchParams(location.search).get('vip') === '1'
  },
  onDiagnostic(d) {
    // eslint-disable-next-line no-console
    console[d.level === 'error' ? 'error' : 'warn']('[renderer]', d);
  }
});

const root = document.getElementById('app');
if (root) createRoot(root).render(<Page />);
