import { Buffer } from "buffer";
import {
  base64ToUrlSafeBase64,
  urlSafeBase64ToBase64,
} from "./base64Conversion";

export const to_base64 = (data: Uint8Array | string): string => {
  const base64String = Buffer.from(data).toString("base64");
  return base64ToUrlSafeBase64(base64String);
};

const keyParseStr =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export const from_base64 = (data: string): Uint8Array => {
  for (let i = 0; i < data.length; i++) {
    const char = data.charAt(i);
    if (keyParseStr.indexOf(char) === -1) {
      throw new Error("invalid input");
    }
  }
  if (data.length === 0) {
    return new Uint8Array([]);
  } else {
    const decodedBase64Str = urlSafeBase64ToBase64(data);
    if (decodedBase64Str.includes(" ")) {
      throw Error("incomplete input");
    }
    return new Uint8Array(Buffer.from(decodedBase64Str, "base64"));
  }
};

export const from_base64_to_string = (data: string): string => {
  for (let i = 0; i < data.length; i++) {
    const char = data.charAt(i);
    if (keyParseStr.indexOf(char) === -1) {
      throw new Error("invalid input");
    }
  }
  if (data.length === 0) {
    return "";
  } else {
    const decodedBase64Str = urlSafeBase64ToBase64(data);
    if (decodedBase64Str.includes(" ")) {
      throw Error("incomplete input");
    }
    return Buffer.from(decodedBase64Str, "base64").toString("utf8");
  }
};
