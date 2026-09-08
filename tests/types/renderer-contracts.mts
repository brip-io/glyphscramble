import type { GlyphPayload } from "../../packages/core/dist/index.js";
import {
  GlyphText as ReactGlyphText,
  GlyphScramble as ReactGlyphScramble,
  type GlyphTextProps as ReactGlyphTextProps,
} from "../../packages/react/dist/index.js";
import {
  GlyphText as NextGlyphText,
  GlyphScramble as NextGlyphScramble,
} from "../../packages/next/dist/index.js";
import {
  GlyphText as VueGlyphText,
  GlyphScramble as VueGlyphScramble,
} from "../../packages/vue/dist/index.js";
import {
  GlyphText as NuxtGlyphText,
  GlyphScramble as NuxtGlyphScramble,
} from "../../packages/nuxt/dist/index.js";
import {
  GlyphText as SvelteGlyphText,
  GlyphScramble as SvelteGlyphScramble,
  type GlyphTextProps as SvelteGlyphTextProps,
} from "../../packages/svelte/dist/index.js";
import {
  GlyphText as SvelteKitGlyphText,
  GlyphScramble as SvelteKitGlyphScramble,
  type GlyphTextProps as SvelteKitGlyphTextProps,
} from "../../packages/sveltekit/dist/index.js";

declare const payload: GlyphPayload;
declare const CustomComponent: (props: { hidden?: boolean }) => unknown;

const reactProps: ReactGlyphTextProps<"p"> = {
  payload,
  as: "p",
  className: "protected",
  fontTimeoutMs: 2_000,
  errorText: "Protected block unavailable.",
};
ReactGlyphText(reactProps);
NextGlyphText(reactProps);
void (ReactGlyphScramble satisfies typeof ReactGlyphText);
void (NextGlyphScramble satisfies typeof NextGlyphText);

// @ts-expect-error GlyphText is payload-only; use GlyphStaticBoundary for subtrees.
ReactGlyphText({ payload, children: "plaintext" });
// @ts-expect-error A custom component cannot guarantee the lifecycle DOM ref.
ReactGlyphText({ payload, as: CustomComponent });
// @ts-expect-error Void intrinsic elements cannot contain protected text.
ReactGlyphText({ payload, as: "img" });
// @ts-expect-error Next exposes the same payload-only renderer contract.
NextGlyphText({ payload, children: "plaintext" });
// @ts-expect-error Next does not accept opaque component polymorphism.
NextGlyphText({ payload, as: CustomComponent });

type VueProps = InstanceType<typeof VueGlyphText>["$props"];
type NuxtProps = InstanceType<typeof NuxtGlyphText>["$props"];
const vueProps: VueProps = {
  payload,
  as: "p",
  id: "protected",
  fontTimeoutMs: 2_000,
};
const nuxtProps: NuxtProps = {
  payload,
  as: "p",
  id: "protected",
  fontTimeoutMs: 2_000,
};
void vueProps;
void nuxtProps;
void (VueGlyphScramble satisfies typeof VueGlyphText);
void (NuxtGlyphScramble satisfies typeof NuxtGlyphText);

// @ts-expect-error Vue slots/children are not part of the leaf renderer props.
const vueChildren: VueProps = { payload, children: "plaintext" };
// @ts-expect-error Vue `as` accepts only the controlled native element set.
const vueComponent: VueProps = { payload, as: CustomComponent };
// @ts-expect-error Void native elements are excluded from the renderer set.
const vueVoidElement: VueProps = { payload, as: "img" };
// @ts-expect-error Nuxt re-exports the same no-children Vue contract.
const nuxtChildren: NuxtProps = { payload, children: "plaintext" };
void vueChildren;
void vueComponent;
void vueVoidElement;
void nuxtChildren;

type SvelteProps = SvelteGlyphTextProps;
type SvelteKitProps = SvelteKitGlyphTextProps;
const svelteProps: SvelteProps = { payload, fontTimeoutMs: 2_000 };
const svelteKitProps: SvelteKitProps = { payload, fontTimeoutMs: 2_000 };
void svelteProps;
void svelteKitProps;
void (SvelteGlyphScramble satisfies typeof SvelteGlyphText);
void (SvelteKitGlyphScramble satisfies typeof SvelteKitGlyphText);

// @ts-expect-error Svelte snippets/children are unavailable on GlyphText.
const svelteChildren: SvelteProps = { payload, children: () => undefined };
const svelteKitChildren: SvelteKitProps = {
  payload,
  // @ts-expect-error SvelteKit re-exports the same no-children contract.
  children: () => undefined,
};
void svelteChildren;
void svelteKitChildren;
