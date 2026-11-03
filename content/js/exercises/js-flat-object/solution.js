function flattenAndMap(obj, mapper) {
  const flattened = {};
  let originalKeysCount = 0;
  let transformedKeysCount = 0;

  const walk = (value, prefix) => {
    for (const [key, entry] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const isPlainObject = entry !== null && typeof entry === "object" && !Array.isArray(entry);

      if (isPlainObject) {
        walk(entry, path);
        continue;
      }

      originalKeysCount++;
      flattened[path] = Array.isArray(entry) ? entry.map((item) => mapper(item)) : mapper(entry);
      transformedKeysCount++;
    }
  };

  walk(obj, "");
  return { flattened, originalKeysCount, transformedKeysCount };
}
