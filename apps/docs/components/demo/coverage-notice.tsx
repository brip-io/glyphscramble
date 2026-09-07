import { WarningIcon } from "@phosphor-icons/react";
import { demoData } from "../../lib/demo-fixtures";

interface CoverageNoticeProps {
  unsupported: readonly string[];
}

/**
 * Unsupported characters are not a demo artefact: they reach the response
 * unscrambled, which is why the engine makes you choose a policy for them.
 */
export function CoverageNotice({ unsupported }: CoverageNoticeProps) {
  if (unsupported.length === 0) return null;
  const plural = unsupported.length > 1;

  return (
    <p className="demo-coverage-notice" role="status">
      <WarningIcon aria-hidden="true" size={18} />
      <span>
        <strong>
          {unsupported.map((character) => `"${character}"`).join(", ")}
        </strong>{" "}
        {plural ? "are" : "is"} outside this face&rsquo;s coverage (
        {demoData.alphabet.coverage}) and {plural ? "reach" : "reaches"} the
        response unscrambled. A real deployment picks the outcome:{" "}
        <code>unsupported: &quot;error&quot;</code> rejects the content,{" "}
        <code>unsupported: &quot;omit&quot;</code> drops the block.
      </span>
    </p>
  );
}
