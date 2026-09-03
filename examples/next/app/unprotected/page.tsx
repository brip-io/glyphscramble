import Link from "next/link";

export default function Unprotected() {
  return (
    <main>
      <Link href="/protected">Open protected content</Link>
      <h1>Cacheable public documentation</h1>
      <p>No GlyphScramble payload is issued by this route.</p>
    </main>
  );
}
