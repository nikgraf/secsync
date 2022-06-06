export const base64ToUrlSafeBase64 = (value: string) => {
  return value.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

export const urlSafeBase64ToBase64 = (value: string) => {
  let newValue = value.replaceAll("-", "+").replaceAll("_", "/");
  while (newValue.length % 4) {
    newValue += "=";
  }
  return newValue;
};
