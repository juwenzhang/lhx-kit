import {createApp} from 'vue';
import {createConfiguredPage} from '@lhx-kit/renderer/vue';
import {createRegistry} from '@lhx-kit/renderer';
import schema from '@/schemas/profile.json';
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
    user: {
      name: 'Alice',
      level: 12,
      skills: [
        {name: 'TypeScript'},
        {name: 'Vue 3'},
        {name: 'Vite'}
      ]
    }
  },
  flags: {
    // Append ?vip=1 to reveal the VIP-only card.
    isVip: new URLSearchParams(location.search).get('vip') === '1'
  },
  onDiagnostic(d) {
    // eslint-disable-next-line no-console
    console[d.level === 'error' ? 'error' : 'warn']('[renderer]', d);
  }
});

createApp(Page).mount('#app');
