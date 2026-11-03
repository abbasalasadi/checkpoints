function transformKeys(obj, transformFn) {
  const convert = (value) => {
    if (Array.isArray(value)) return value.map((item) => convert(item));
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [transformFn(key), convert(entry)]),
    );
  };

  return convert(obj);
}
