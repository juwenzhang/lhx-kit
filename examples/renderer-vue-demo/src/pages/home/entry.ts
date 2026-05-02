import {createApp} from 'vue';
import {createConfiguredPage} from '@lhx-kit/renderer/vue';
import {createRegistry} from '@lhx-kit/renderer';
import schema from '@/schemas/home.json';
import Heading from '@/components/Heading.vue';
import Card from '@/components/Card.vue';
import Paragraph from '@/components/Paragraph.vue';

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

createApp(Page).mount('#app');
