import {createRoot} from 'react-dom/client';
import {createConfiguredPage} from '@lhx-kit/renderer/react';
import {createRegistry} from '@lhx-kit/renderer';
import schema from '@/schemas/home.json';
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
    items: [
      {label: 'First item'},
      {label: 'Second item'},
      {label: 'Third item'}
    ]
  },
  flags: {
    // Flip to true to see the review-only card.
    isReview: new URLSearchParams(location.search).get('review') === '1'
  },
  onDiagnostic(d) {
    // eslint-disable-next-line no-console
    console[d.level === 'error' ? 'error' : 'warn']('[renderer]', d);
  }
});

const root = document.getElementById('app');
if (root) createRoot(root).render(<Page />);
