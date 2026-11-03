function trapObject(obj, fn) {
  const wrap = (target) =>
    new Proxy(target, {
      get(inner, key, receiver) {
        const value = Reflect.get(inner, key, receiver);
        if (typeof key === "symbol") return value;
        fn("get", key, value);
        return value !== null && typeof value === "object" ? wrap(value) : value;
      },
      set(inner, key, next, receiver) {
        if (typeof key !== "symbol") fn("set", key, Reflect.get(inner, key, receiver), next);
        return Reflect.set(inner, key, next, receiver);
      },
    });

  return wrap(obj);
}
