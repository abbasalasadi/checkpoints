function deepEqual(obj1, obj2) {
  const inProgress = [];

  const sameEntries = (a, b, compare) => {
    if (a.size !== b.size) return false;
    const left = [...a];
    const right = [...b];
    return left.every((entry, i) => compare(entry, right[i]));
  };

  const compare = (a, b) => {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a === "function") return false;
    if (a === null || b === null) return false;
    if (typeof a !== "object") return false;

    if (a instanceof Date || b instanceof Date) {
      return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    }
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (inProgress.some(([x, y]) => x === a && y === b)) return false;
    inProgress.push([a, b]);
    try {
      if (a instanceof Map || b instanceof Map) {
        if (!(a instanceof Map && b instanceof Map)) return false;
        return sameEntries(a, b, ([ka, va], [kb, vb]) => compare(ka, kb) && compare(va, vb));
      }
      if (a instanceof Set || b instanceof Set) {
        if (!(a instanceof Set && b instanceof Set)) return false;
        return sameEntries(a, b, (x, y) => compare(x, y));
      }

      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every((key) => Object.hasOwn(b, key) && compare(a[key], b[key]));
    } finally {
      inProgress.pop();
    }
  };

  return compare(obj1, obj2);
}
