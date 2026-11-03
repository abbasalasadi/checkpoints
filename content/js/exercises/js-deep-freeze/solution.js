function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") {
    throw Error("Input must be a non-null object");
  }

  const frozen = new WeakSet();

  const freeze = (value) => {
    if (value === null || typeof value !== "object" || frozen.has(value)) return value;
    frozen.add(value);
    Object.freeze(value);
    for (const entry of Object.values(value)) freeze(entry);
    return value;
  };

  return freeze(obj);
}
