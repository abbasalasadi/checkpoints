function flattenObject(obj) {
  const flat = {};

  const walk = (value, prefix) => {
    for (const [key, entry] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (entry !== null && typeof entry === "object") walk(entry, path);
      else flat[path] = entry;
    }
  };

  walk(obj, "");
  return flat;
}
