function deepFind(obj, path) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw Error("Input must be a non-null object");
  }
  if (typeof path !== "string") throw Error("Path must be a string");

  return path.split(".").reduce((current, segment) => {
    if (current === null || current === undefined) return undefined;
    return current[segment];
  }, obj);
}
