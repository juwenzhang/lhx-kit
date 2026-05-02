<script setup lang="ts">
// Second in-page view for the "home" MPA entry.
</script>

<template>
  <section class="home-about">
    <h2>About this page</h2>
    <p>
      This is a second view inside the <code>home</code> MPA entry.
      Each MPA page owns its own router; switching views here does not
      affect other pages like <code>/settings/</code>.
    </p>
    <router-link to="/">
      Back to landing
    </router-link>
  </section>
</template>
