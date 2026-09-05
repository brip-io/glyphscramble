"use client";

import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface SearchEntry {
  slug: string;
  title: string;
  description: string;
  group: string;
  text: string;
}

function score(entry: SearchEntry, query: string): number {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const title = entry.title.toLowerCase();
  const description = entry.description.toLowerCase();
  const text = entry.text.toLowerCase();
  let total = 0;
  for (const word of words) {
    if (
      !text.includes(word) &&
      !title.includes(word) &&
      !description.includes(word)
    ) {
      return -1;
    }
    if (title === word) total += 12;
    else if (title.startsWith(word)) total += 8;
    else if (title.includes(word)) total += 5;
    if (description.includes(word)) total += 3;
    if (text.includes(word)) total += 1;
  }
  return total;
}

export function DocsSearch({ searchPath }: { searchPath: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  async function ensureIndex() {
    if (entries || error) return;
    try {
      const response = await fetch(searchPath);
      if (!response.ok)
        throw new Error(`Search index failed: ${response.status}`);
      setEntries((await response.json()) as SearchEntry[]);
    } catch {
      setError(true);
    }
  }

  function open() {
    dialog.current?.showModal();
    void ensureIndex();
    window.setTimeout(() => input.current?.focus(), 0);
  }

  function close() {
    dialog.current?.close();
    setQuery("");
    opener.current?.focus();
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialog.current?.open) close();
        else open();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (dialog.current?.open) dialog.current.close();
    setQuery("");
  }, [pathname]);

  const results = useMemo(() => {
    if (!entries || query.trim().length < 2) return [];
    return entries
      .map((entry) => ({ entry, score: score(entry, query) }))
      .filter((result) => result.score >= 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8)
      .map((result) => result.entry);
  }, [entries, query]);

  return (
    <>
      <button
        ref={opener}
        className="docs-search-trigger"
        type="button"
        onClick={open}
      >
        <MagnifyingGlassIcon aria-hidden="true" size={16} />
        <span>Search docs</span>
        <kbd>⌘K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="docs-search-dialog"
        aria-labelledby="docs-search-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
      >
        <div className="docs-search-panel">
          <header>
            <h2 id="docs-search-title">Search documentation</h2>
            <button type="button" onClick={close} aria-label="Close search">
              <XIcon aria-hidden="true" size={18} />
            </button>
          </header>
          <label htmlFor="docs-search-input">
            Search by task, framework, or API
          </label>
          <div className="docs-search-input-wrap">
            <MagnifyingGlassIcon aria-hidden="true" size={18} />
            <input
              ref={input}
              id="docs-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “static caching”"
              autoComplete="off"
            />
          </div>
          <div className="docs-search-results" aria-live="polite">
            {!entries && !error ? (
              <p className="search-state">Loading the local index…</p>
            ) : error ? (
              <div className="search-state search-error">
                <strong>Search is unavailable.</strong>
                <span>
                  Use the documentation navigation while the index is repaired.
                </span>
              </div>
            ) : query.trim().length < 2 ? (
              <p className="search-state">Enter at least two characters.</p>
            ) : results.length === 0 ? (
              <div className="search-state">
                <strong>No matching pages.</strong>
                <span>Try a framework name, “SEO”, “caching”, or “CLI”.</span>
              </div>
            ) : (
              <ul>
                {results.map((entry) => (
                  <li key={entry.slug}>
                    <button
                      type="button"
                      onClick={() => router.push(`/docs/${entry.slug}/`)}
                    >
                      <span>
                        <strong>{entry.title}</strong>
                        <small>{entry.group}</small>
                      </span>
                      <span>{entry.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
