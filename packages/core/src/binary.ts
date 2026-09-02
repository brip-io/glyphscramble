export function align4(value: number): number {
  return (value + 3) & ~3;
}

export function checksum(bytes: Uint8Array): number {
  const padded = new Uint8Array(align4(bytes.length));
  padded.set(bytes);
  const view = new DataView(padded.buffer);
  let sum = 0;
  for (let offset = 0; offset < padded.length; offset += 4)
    sum = (sum + view.getUint32(offset)) >>> 0;
  return sum;
}

export function tag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

export function writeTag(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < 4; index++)
    view.setUint8(offset + index, value.charCodeAt(index));
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
