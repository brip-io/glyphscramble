import Link from "next/link";
import { Suspense } from "react";
import { GlyphScramble } from "@brip/glyphscramble-next";
import { glyphs } from "../../glyphscramble.next";
import { ClonedPayload } from "./cloned-payload";

const FIRST = "Sensitive analyst note alpha.";
const SECOND = "Sensitive analyst note beta.";

async function ProtectedBlocks() {
  const first = await glyphs.scramble(FIRST, { font: "body", lang: "en" });
  const second = await glyphs.scramble(SECOND, { font: "body", lang: "en" });
  return (
    <section aria-label="Demonstration of intentionally inaccessible protected content">
      <ClonedPayload payload={first} />
      <GlyphScramble
        className="protected"
        data-testid="protected-second"
        data-font-url={second.fontUrl}
        payload={second}
      />
    </section>
  );
}

export default function Protected() {
  return (
    <main>
      <nav>
        <Link href="/">Home</Link>
        <Link href="/unprotected">Unprotected example</Link>
      </nav>
      <h1>Protected high-value block fixture</h1>
      <Suspense fallback={<p>Preparing protected content…</p>}>
        <ProtectedBlocks />
      </Suspense>
    </main>
  );
}
