<script setup lang="ts">
import type { GlyphPayload } from "@brip/glyphscramble-nuxt";

interface ProtectedPayloads {
  first: GlyphPayload;
  second: GlyphPayload;
}

const { data } = await useAsyncData("protected-payloads", () =>
  $fetch<ProtectedPayloads>("/api/protected"),
);
if (!data.value) throw createError({ statusCode: 503 });
const first = ref(data.value.first);
const second = computed(() => data.value!.second);

async function replacePayload(): Promise<void> {
  const replacement = await $fetch<ProtectedPayloads>("/api/protected");
  first.value = replacement.first;
}

function clonePayload(): void {
  first.value = {
    ...first.value,
    face: {
      ...first.value.face,
      unicodeRange: [...first.value.face.unicodeRange],
    },
  };
}
</script>

<template>
  <main>
    <nav>
      <NuxtLink to="/">Home</NuxtLink>
      <NuxtLink to="/unprotected">Unprotected example</NuxtLink>
    </nav>
    <h1>Protected high-value block fixture</h1>
    <section aria-label="Intentionally inaccessible protected content">
      <GlyphText
        :payload="first"
        as="span"
        class="protected"
        data-testid="protected-first"
        :data-font-url="first.fontUrl"
        error-text="Protected fixture unavailable."
      />
      <GlyphText
        :payload="second"
        as="span"
        class="protected"
        data-testid="protected-second"
        :data-font-url="second.fontUrl"
      />
      <button data-testid="clone-payload" type="button" @click="clonePayload">
        Clone equivalent payload
      </button>
      <button
        data-testid="replace-payload"
        type="button"
        @click="replacePayload"
      >
        Replace payload
      </button>
    </section>
  </main>
</template>
