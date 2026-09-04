const NODE_PRESETS = new Set(["node", "node-server"]);

/** @internal Guard the process-local variant pool against unsupported Nitro runtimes. */
export function assertSupportedNitroPreset(preset: string | undefined): void {
  if (preset === undefined || NODE_PRESETS.has(preset)) return;
  throw new Error(
    `@brip/glyphscramble-nuxt supports Nitro's node-server preset in v0.1; received ${JSON.stringify(preset)}. Edge, serverless, and multi-instance deployment require an external FontVariantProvider so the page and font request share the issued mapping.`,
  );
}
