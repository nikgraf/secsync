export const deserialize = (data: string) => {
  return JSON.parse(data, (key, value) => {
    if (
      typeof value === "object" &&
      value !== null &&
      value.type === "Uint8Array"
    ) {
      return new Uint8Array(value.data);
    }
    return value;
  });
};
