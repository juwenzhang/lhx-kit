<script setup lang="ts">
import {createRegistry} from '@lhx-kit/renderer';
import {createConfiguredPage} from '@lhx-kit/renderer/vue';
import Card from '@/components/Card.vue';
import Heading from '@/components/Heading.vue';
import Paragraph from '@/components/Paragraph.vue';
import schema from '../render.json';

const registry = createRegistry<typeof Heading | typeof Card | typeof Paragraph>();
registry.registerAll({
  Heading: () => Heading,
  Card: () => Card,
  Paragraph: () => Paragraph
});

const RendererPage = createConfiguredPage({
  schema: schema as unknown as Parameters<typeof createConfiguredPage>[0]['schema'],
  registry: registry as unknown as Parameters<typeof createConfiguredPage>[0]['registry'],
  state: {greeting: 'Welcome to examples/cli-smoke'},
  flags: {showPromo: new URLSearchParams(location.search).get('promo') === '1'}
});
</script>

<template>
  <section class="home-landing">
    <RendererPage />
    <nav class="home-landing__nav">
      <router-link to="/about">Go to About</router-link>
    </nav>
  </section>
</template>

<style scoped>
.home-landing__nav {
  margin-top: 16px;
}
</style>
