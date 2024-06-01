import { retryAsyncFunction } from "./retryAsyncFunction";

test("should return the result of asyncFunction when it is successful", async () => {
  const asyncFunction = jest.fn().mockResolvedValue("Success");

  const result = await retryAsyncFunction(asyncFunction);
  expect(result).toBe("Success");
  expect(asyncFunction).toHaveBeenCalledTimes(1);
});

test("should retry the function when it throws an unlisted error", async () => {
  const asyncFunction = jest
    .fn()
    .mockRejectedValueOnce(new Error("Retryable error"))
    .mockResolvedValueOnce("Success");

  const result = await retryAsyncFunction(asyncFunction);

  expect(result).toBe("Success");
  expect(asyncFunction).toHaveBeenCalledTimes(2);
});

test("should throw the error immediately when it is in the errorsToBailOn list", async () => {
  const asyncFunction = jest
    .fn()
    .mockRejectedValueOnce(new TypeError("Non-retryable error"));
  const errorsToBailOn = [TypeError];

  await expect(
    retryAsyncFunction(asyncFunction, errorsToBailOn)
  ).rejects.toThrow("Non-retryable error");
  expect(asyncFunction).toHaveBeenCalledTimes(1);
});

test("should stop retrying after maxRetries attempts and throw the last error", async () => {
  const asyncFunction = jest
    .fn()
    .mockRejectedValue(new Error("Retryable error"));

  await expect(retryAsyncFunction(asyncFunction, [], 2)).rejects.toThrow(
    "Retryable error"
  );
  expect(asyncFunction).toHaveBeenCalledTimes(2);
});
