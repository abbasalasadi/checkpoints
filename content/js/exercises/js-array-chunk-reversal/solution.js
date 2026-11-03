function reverseChunks(arr, chunkSize) {
  const out = [];
  for (let start = 0; start < arr.length; start += chunkSize) {
    out.push(...arr.slice(start, start + chunkSize).reverse());
  }
  return out;
}
