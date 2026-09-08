"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  GLYPH_BETA_CHANNEL,
  GLYPH_INSTALLATION_PROFILES,
  glyphInstallCommand,
} from "@brip/glyphscramble/package-surface";

const defaultCommands = [
  glyphInstallCommand(
    "pnpm",
    GLYPH_INSTALLATION_PROFILES.next,
    GLYPH_BETA_CHANNEL,
  ),
];

export function CopyCommand({
  commands = defaultCommands,
}: {
  commands?: readonly string[];
}) {
  const [copied, setCopied] = useState(false);

  async function copyCommands() {
    await navigator.clipboard.writeText(commands.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="quickstart-command">
      <div>
        {commands.map((command) => (
          <code key={command}>{command}</code>
        ))}
      </div>
      <button type="button" onClick={copyCommands}>
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
