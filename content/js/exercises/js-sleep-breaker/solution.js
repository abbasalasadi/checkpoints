function sleepBreaker(delay, breaker) {
  const sleep = new Promise((resolve) => setTimeout(resolve, delay));
  return Promise.race([sleep, breaker()]);
}
