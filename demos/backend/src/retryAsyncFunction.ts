export async function retryAsyncFunction(func: () => any, maxRetries = 5) {
  let keepTrying = true;
  let count = 0;
  let result = undefined;

  while (keepTrying && count < maxRetries) {
    try {
      result = await func();
      keepTrying = false;
    } catch {
      count = count + 1;
    }
  }
  return result;
}
