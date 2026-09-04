export default defineNuxtConfig({
  modules: [
    [
      "@brip/glyphscramble-nuxt/module",
      {
        streaming: {
          protectedRoutes: ["/protected", "/streamed"],
        },
      },
    ],
  ],
  css: ["~/assets/styles.css"],
  devtools: { enabled: false },
  compatibilityDate: "2026-09-04",
});
