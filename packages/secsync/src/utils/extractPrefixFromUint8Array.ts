export function extractPrefixFromUint8Array(
  uint8Array: Uint8Array,
  amount: number
): { prefix: Uint8Array; value: Uint8Array } {
  if (amount > uint8Array.length) {
    throw new Error(
      "Amount of prefix items to extract is larger than the Uint8Array"
    );
  }

  const prefix = uint8Array.slice(0, amount);
  const value = uint8Array.slice(amount);

  return { prefix, value };
}
