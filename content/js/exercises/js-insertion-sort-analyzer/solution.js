function insertionSortAnalyzer(arr, comparator) {
  const sortedArray = arr.slice();
  let iterations = 0;
  let swaps = 0;

  for (let i = 1; i < sortedArray.length; i++) {
    const key = sortedArray[i];
    let j = i - 1;
    while (j >= 0) {
      iterations++;
      if (comparator(sortedArray[j], key) <= 0) break;
      sortedArray[j + 1] = sortedArray[j];
      swaps++;
      j--;
    }
    sortedArray[j + 1] = key;
  }

  return { sortedArray, iterations, swaps };
}
