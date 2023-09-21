import { SnapshotUpdateClocks } from "../types";
import { compareUpdateClocks } from "./compareUpdateClocks";

test("should return equal true if clocks are the same", () => {
  const clockA: SnapshotUpdateClocks = {
    key1: 1,
    key2: 2,
  };
  const result = compareUpdateClocks(clockA, clockA);
  expect(result).toEqual({ equal: true, missing: {} });
});

test("should return equal false if clocks are not the same", () => {
  const clockA: SnapshotUpdateClocks = {
    key1: 1,
    key2: 4,
  };
  const clockB: SnapshotUpdateClocks = {
    key1: 1,
    key2: 2,
  };
  const result = compareUpdateClocks(clockA, clockB);
  expect(result).toEqual({ equal: false, missing: { key2: 2 } });
});

test("should return missing keys from the first clock", () => {
  const clockA: SnapshotUpdateClocks = {
    key1: 1,
    key2: 2,
  };
  const clockB: SnapshotUpdateClocks = {
    key1: 1,
  };
  const result = compareUpdateClocks(clockA, clockB);
  expect(result).toEqual({ equal: false, missing: { key2: 0 } });
});

test("should return an empty missing object if second clock has extra keys", () => {
  const clockA: SnapshotUpdateClocks = {
    key1: 1,
    key2: 2,
  };
  const clockB: SnapshotUpdateClocks = {
    key1: 1,
    key2: 2,
    key3: 3,
  };
  const result = compareUpdateClocks(clockA, clockB);
  expect(result).toEqual({ equal: false, missing: {} });
});
