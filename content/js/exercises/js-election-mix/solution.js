function createCurriedFilterAndMap(criteria, mapper) {
  return (obj) => {
    const filteredObject = {};
    let keysKept = 0;
    let keysFilteredOut = 0;

    for (const [key, value] of Object.entries(obj)) {
      if (criteria(key, value)) {
        filteredObject[key] = mapper(value);
        keysKept++;
      } else {
        keysFilteredOut++;
      }
    }

    return { filteredObject, keysKept, keysFilteredOut };
  };
}
