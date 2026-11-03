function mergeAndTransform(objects, transforms) {
  const merged = { ...objects[0] };
  let keysAdded = 0;
  let keysOverwritten = 0;

  for (const source of objects.slice(1)) {
    for (const [key, value] of Object.entries(source)) {
      if (Object.hasOwn(merged, key)) keysOverwritten++;
      else keysAdded++;
      merged[key] = value;
    }
  }

  const finalObject = transforms.reduce((current, transform) => transform(current), merged);

  return {
    finalObject,
    transformationsCount: transforms.length,
    keysAdded,
    keysOverwritten,
  };
}
