import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";

export default function NotFound() {
  return (
    <section className="not-found shell" aria-labelledby="not-found-title">
      <p className="eyebrow">404 / Route not found</p>
      <h1 id="not-found-title">This page is not in the build.</h1>
      <p>
        The documentation registry is the source of truth. Search the current
        corpus or return to its first task.
      </p>
      <a className="button button-primary" href="/docs/">
        <ArrowLeftIcon aria-hidden="true" size={17} />
        Browse documentation
      </a>
    </section>
  );
}
