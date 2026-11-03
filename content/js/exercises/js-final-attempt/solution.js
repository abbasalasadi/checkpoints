function FinalAttempt(callback, count) {
  return async (...args) => {
    for (let attempt = 0; attempt < count; attempt++) {
      try {
        return await callback(...args);
      } catch {
        continue;
      }
    }
    return "Final Attempt Fail";
  };
}
