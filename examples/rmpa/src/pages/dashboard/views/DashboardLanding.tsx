import type {ReactElement} from 'react';
import {Link} from 'react-router-dom';
import {createConfiguredPage} from '@lhx-kit/renderer/react';
import {createRegistry} from '@lhx-kit/renderer';
import schema from '../render.json';
import {Heading} from '@/components/Heading';
import {Card} from '@/components/Card';
import {Paragraph} from '@/components/Paragraph';

const registry = createRegistry<typeof Heading | typeof Card | typeof Paragraph>();
registry.registerAll({
  Heading: () => Heading,
  Card: () => Card,
  Paragraph: () => Paragraph
});

const RendererPage = createConfiguredPage({
  schema: schema as unknown as Parameters<typeof createConfiguredPage>[0]['schema'],
  registry: registry as unknown as Parameters<typeof createConfiguredPage>[0]['registry'],
  state: {greeting: 'Dashboard'},
  flags: {showPromo: new URLSearchParams(location.search).get('promo') === '1'}
});

export default function DashboardLanding(): ReactElement {
  return (
    <section className="dashboard-landing">
      <RendererPage />
      <nav className="dashboard-landing__nav" style={{marginTop: 16}}>
        <Link to="/about">Go to About</Link>
      </nav>
    </section>
  );
}
