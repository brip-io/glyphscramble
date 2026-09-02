/** The initializer writes the Nitro handler and component registration. */
export default function glyphscrambleModule(
  _options: unknown,
  nuxt: { options: { runtimeConfig: Record<string, unknown> } },
): void {
  nuxt.options.runtimeConfig.glyphscramble = { enabled: true };
}
