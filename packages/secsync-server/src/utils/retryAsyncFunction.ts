export async function retryAsyncFunction(
  asyncFunction: () => Promise<any>,
  errorsToBailOn: any[] = [],
  maxRetries: number = 5
): Promise<any> {
  let delay = 100;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      return await asyncFunction();
    } catch (err) {
      // if the error message is in the errorsToBailOn array, throw the error immediately
      for (const error of errorsToBailOn) {
        if (err instanceof error) {
          throw err;
        }
      }
      // increase retries count
      retries += 1;
      // ff the retries exceed maxRetries, throw the last error
      if (retries >= maxRetries) {
        throw err;
      }
      // wait for a delay before retrying the function
      await new Promise((resolve) => setTimeout(resolve, delay));
      // double the delay value
      delay *= 2;
    }
  }
}
