"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useCopyToClipboard } from "../hooks/use-copy-to-clipboard";

const defaultCommands = [
  "pnpm add @brip/glyphscramble @brip/glyphscramble-next @brip/glyphscramble-react",
];

export function CopyCommand({
  commands = defaultCommands,
}: {
  commands?: readonly string[];
}) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <div className="quickstart-command">
      <div>
        {commands.map((command) => (
          <code key={command}>{command}</code>
        ))}
      </div>
      <button type="button" onClick={() => copy(commands.join("\n"))}>
        {copied ? (
          <CheckIcon aria-hidden="true" size={16} />
        ) : (
          <CopyIcon aria-hidden="true" size={16} />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Quickstart commands copied to clipboard." : ""}
      </span>
    </div>
  );
}
