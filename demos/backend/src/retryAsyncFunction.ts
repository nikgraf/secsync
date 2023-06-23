export async function retryAsyncFunction(
  func: () => any,
  errorsToBailOn: any[] = [],
  maxRetries = 5
) {
  let keepTrying = true;
  let count = 0;
  let result = undefined;

  while (keepTrying && count < maxRetries) {
    try {
      result = await func();
      keepTrying = false;
    } catch (err) {
      console.log(err);
      for (const error of errorsToBailOn) {
        if (err instanceof error) {
          throw err;
        }
      }
      count = count + 1;
    }
  }
  return result;
}
