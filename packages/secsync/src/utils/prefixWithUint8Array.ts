export function prefixWithUint8Array(
  value: string | Uint8Array,
  prefix: Uint8Array
): string | Uint8Array {
  if (typeof value === "string") {
    const valueUint8Array = new Uint8Array(
      // @ts-ignore doesn't work with older ES targets
      [...value].map((char) => char.charCodeAt(0))
    );
    const result = new Uint8Array(prefix.length + valueUint8Array.length);

    result.set(prefix);
    result.set(valueUint8Array, prefix.length);

    // @ts-ignore fails on some environments and not in others
    return String.fromCharCode.apply(null, result);
  } else {
    const result = new Uint8Array(prefix.length + value.length);

    result.set(prefix);
    result.set(value, prefix.length);

    return result;
  }
}
