import {
  base64ToUrlSafeBase64,
  urlSafeBase64ToBase64,
} from "./base64Conversion";
import sodium from "libsodium-wrappers";

test("should decode libsodium-compatible base64 to a string", async () => {
  await sodium.ready;

  const result = base64ToUrlSafeBase64(
    "TllqyZUK9X/oa3MzucvObvNibV85o++l+0XhGDtjjs6+QwNHitwYhTT/W+jxWtpNFf7db0IK7vI4LI3+yMO0AQ=="
  );

  expect(result).toEqual(
    "TllqyZUK9X_oa3MzucvObvNibV85o--l-0XhGDtjjs6-QwNHitwYhTT_W-jxWtpNFf7db0IK7vI4LI3-yMO0AQ"
  );
});

test("should decode libsodium-compatible base64 to a string", async () => {
  await sodium.ready;

  const result = urlSafeBase64ToBase64(
    "TllqyZUK9X_oa3MzucvObvNibV85o--l-0XhGDtjjs6-QwNHitwYhTT_W-jxWtpNFf7db0IK7vI4LI3-yMO0AQ"
  );

  expect(result).toEqual(
    "TllqyZUK9X/oa3MzucvObvNibV85o++l+0XhGDtjjs6+QwNHitwYhTT/W+jxWtpNFf7db0IK7vI4LI3+yMO0AQ=="
  );
});
