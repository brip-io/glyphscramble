"use client";

import {
  SiAstro,
  SiBun,
  SiNextdotjs,
  SiNpm,
  SiNuxt,
  SiPnpm,
  SiSvelte,
  SiVite,
  SiYarn,
  type IconType,
} from "@icons-pack/react-simple-icons";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import {
  FRAMEWORK_OPTIONS,
  PACKAGE_MANAGERS,
  availableModes,
  frameworkOption,
  initCommand,
  installCommand,
  modeForFramework,
  packagesForSelection,
  type InstallationProfiles,
  type InstallerFramework,
  type InstallerMode,
  type InstallerPackageManager,
} from "../src/install-configurator";

const FRAMEWORK_ICONS: Readonly<Record<InstallerFramework, IconType>> = {
  next: SiNextdotjs,
  nuxt: SiNuxt,
  sveltekit: SiSvelte,
  astro: SiAstro,
  vite: SiVite,
};

const PACKAGE_MANAGER_ICONS: Readonly<
  Record<InstallerPackageManager, IconType>
> = {
  npm: SiNpm,
  pnpm: SiPnpm,
  yarn: SiYarn,
  bun: SiBun,
};

function CopyableCommand({
  command,
  label,
}: {
  command: string;
  label: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current !== undefined)
        window.clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    if (resetTimer.current !== undefined)
      window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 1800);
  }

  const buttonLabel =
    copyState === "copied"
      ? "Copied"
      : copyState === "error"
        ? "Copy failed"
        : "Copy";

  return (
    <div className="installer-command">
      <code>{command}</code>
      <button
        type="button"
        onClick={copyCommand}
        aria-label={label + ": " + buttonLabel}
      >
        {copyState === "copied" ? (
          <CheckIcon aria-hidden="true" size={16} />
        ) : (
          <CopyIcon aria-hidden="true" size={16} />
        )}
        <span>{buttonLabel}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copyState === "copied"
          ? label + " copied to clipboard."
          : copyState === "error"
            ? label +
              " could not be copied. Select the command and copy it manually."
            : ""}
      </span>
    </div>
  );
}

function LogoChoice<T extends string>({
  active,
  icon: Icon,
  label,
  onSelect,
  value,
}: {
  active: boolean;
  icon: IconType;
  label: string;
  onSelect: (value: T) => void;
  value: T;
}) {
  return (
    <button
      type="button"
      className="installer-logo-choice"
      aria-pressed={active}
      onClick={() => onSelect(value)}
    >
      <Icon aria-hidden="true" size={18} />
      <span>{label}</span>
    </button>
  );
}

export function InstallationConfigurator({
  profiles,
}: {
  profiles: InstallationProfiles;
}) {
  const [framework, setFramework] = useState<InstallerFramework>("next");
  const [mode, setMode] = useState<InstallerMode>("response");
  const [packageManager, setPackageManager] =
    useState<InstallerPackageManager>("pnpm");

  function selectFramework(nextFramework: InstallerFramework) {
    setFramework(nextFramework);
    setMode((currentMode) => modeForFramework(nextFramework, currentMode));
  }

  const option = frameworkOption(framework);
  const modes = availableModes(framework);
  const packages = packagesForSelection(profiles, framework, mode);

  return (
    <div className="install-configurator">
      <div className="installer-controls">
        <fieldset className="installer-framework-fieldset">
          <legend>Framework</legend>
          <div className="installer-logo-choices">
            {FRAMEWORK_OPTIONS.map((item) => (
              <LogoChoice
                key={item.id}
                active={framework === item.id}
                icon={FRAMEWORK_ICONS[item.id]}
                label={item.label}
                onSelect={selectFramework}
                value={item.id}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Delivery</legend>
          <div className="installer-segmented">
            {modes.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mode === item}
                onClick={() => setMode(item)}
              >
                {item === "response" ? "Per response" : "Static build"}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Install with</legend>
          <div className="installer-logo-choices installer-manager-choices">
            {PACKAGE_MANAGERS.map((item) => (
              <LogoChoice
                key={item.id}
                active={packageManager === item.id}
                icon={PACKAGE_MANAGER_ICONS[item.id]}
                label={item.label}
                onSelect={setPackageManager}
                value={item.id}
              />
            ))}
          </div>
        </fieldset>
      </div>

      <div className="installer-output">
        <div className="installer-output-heading">
          <p>
            {option.label}. {option.description}.
          </p>
          <span>Beta packages. Node 22 or 24.</span>
        </div>

        <ol className="installer-commands">
          <li>
            <span>Install</span>
            <CopyableCommand
              command={installCommand(packageManager, packages)}
              label="Install command"
            />
          </li>
          <li>
            <span>Initialize</span>
            <CopyableCommand
              command={initCommand(packageManager, framework, mode)}
              label="Initializer command"
            />
          </li>
        </ol>

        <div className="installer-next-action">
          <p>
            <strong>Then:</strong> {option.nextAction[mode]}
          </p>
          <a href={option.guidePath}>Read the integration guide</a>
        </div>
      </div>

      <p className="installer-scope-note">
        Use on non-essential, high-value blocks. Keep navigation, forms,
        headings, and legal text plain.
      </p>
      <p className="sr-only" aria-live="polite">
        Installation updated for {option.label},{" "}
        {mode === "response" ? "per response" : "static build"}, using{" "}
        {packageManager}.
      </p>
    </div>
  );
}
