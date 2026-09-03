import Link from "next/link";

export default function Home() {
  return (
    <main>
      <nav>
        <Link href="/protected" prefetch>
          Protected example
        </Link>
        <Link href="/unprotected">Unprotected example</Link>
      </nav>
      <h1>GlyphScramble Next fixture</h1>
      <p>This page remains ordinary static content.</p>
    </main>
  );
}
