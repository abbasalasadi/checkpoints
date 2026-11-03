function deepClone(obj) {
  const seen = new WeakMap();

  const clone = (value) => {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);

    if (value instanceof Date) return new Date(value.getTime());

    const copy = Array.isArray(value) ? [] : {};
    seen.set(value, copy);
    for (const [key, entry] of Object.entries(value)) {
      copy[key] = clone(entry);
    }
    return copy;
  };

  return clone(obj);
}
