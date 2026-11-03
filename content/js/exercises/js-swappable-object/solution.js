function swappableObject(obj) {
  return new Proxy({ ...obj }, {
    get(target, key) {
      if (typeof key !== "string") return Reflect.get(target, key);
      if (Object.hasOwn(target, key)) return target[key];
      return Object.keys(target).find((name) => target[name] === key);
    },
  });
}
