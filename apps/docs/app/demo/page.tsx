import type { Metadata } from "next";
import { DemoExplorer } from "../../components/demo-explorer";

export const metadata: Metadata = {
  title: "Demo",
  description:
    "Inspect real GlyphScramble output across raw-fetch, human-rendering, and recovery paths.",
};

export default function DemoPage() {
  return (
    <div className="inner-page shell">
      <header className="page-intro demo-intro">
        <h1>Compare the response with the render.</h1>
        <p>
          Switch between real generated fixtures. The browser applies the
          matching font to the same encoded text a raw scraper receives.
        </p>
      </header>
      <DemoExplorer />
    </div>
  );
}
