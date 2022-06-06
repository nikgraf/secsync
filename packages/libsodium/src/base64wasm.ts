import sodium from "libsodium-wrappers";

export const to_base64 = (data: Uint8Array | string) => {
  return sodium.to_base64(data);
};

export const from_base64 = (data: string) => {
  return sodium.from_base64(data);
};

export const from_base64_to_string = (data: string): string => {
  return sodium.to_string(sodium.from_base64(data));
};
