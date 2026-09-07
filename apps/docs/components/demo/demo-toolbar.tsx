import {
  deliveryModes,
  variantKeys,
  type DeliveryMode,
  type VariantKey,
} from "../../lib/demo-fixtures";

interface DemoToolbarProps {
  mode: DeliveryMode;
  variant: VariantKey;
  onSelectMode(mode: DeliveryMode): void;
  onSelectVariant(variant: VariantKey): void;
}

export function DemoToolbar({
  mode,
  variant,
  onSelectMode,
  onSelectVariant,
}: DemoToolbarProps) {
  const variantNoun =
    deliveryModes.find((entry) => entry.id === mode)?.variantNoun ?? "Variant";

  return (
    <div className="demo-toolbar">
      <div className="demo-control">
        <span id="demo-delivery-label">Delivery</span>
        <div
          className="segmented"
          role="group"
          aria-labelledby="demo-delivery-label"
        >
          {deliveryModes.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={mode === entry.id}
              onClick={() => onSelectMode(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="demo-control">
        <span id="demo-variant-label">{variantNoun}</span>
        <div
          className="variant-switch"
          role="group"
          aria-labelledby="demo-variant-label"
        >
          {variantKeys.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={variant === key}
              onClick={() => onSelectVariant(key)}
            >
              {key.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
