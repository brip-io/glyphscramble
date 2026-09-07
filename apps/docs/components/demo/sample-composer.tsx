import {
  ArrowCounterClockwiseIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";
import { MAX_SAMPLE_LENGTH } from "../../hooks/use-glyph-sample";

interface SampleComposerProps {
  value: string;
  isDefault: boolean;
  onEdit(value: string): void;
  onReset(): void;
}

export function SampleComposer({
  value,
  isDefault,
  onEdit,
  onReset,
}: SampleComposerProps) {
  return (
    <div className="demo-composer">
      <div className="demo-composer-header">
        <label htmlFor="demo-sample">
          <PencilSimpleIcon aria-hidden="true" size={17} />
          Your text
        </label>
        <div className="demo-composer-meta">
          <span aria-hidden="true">
            {value.length}/{MAX_SAMPLE_LENGTH}
          </span>
          <button type="button" onClick={onReset} disabled={isDefault}>
            <ArrowCounterClockwiseIcon aria-hidden="true" size={15} />
            Reset
          </button>
        </div>
      </div>
      <textarea
        id="demo-sample"
        value={value}
        maxLength={MAX_SAMPLE_LENGTH}
        rows={2}
        spellCheck={false}
        autoComplete="off"
        placeholder="Type anything to scramble it."
        onChange={(event) => onEdit(event.target.value)}
      />
      <p className="demo-composer-hint">
        Encoded in your browser so you can edit it. A real response ships only
        the encoded text and the font, never the table that undoes them.
      </p>
    </div>
  );
}
