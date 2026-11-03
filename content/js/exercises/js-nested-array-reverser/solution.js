function nestedArrayReverser(words) {
  return words
    .slice()
    .reverse()
    .map((inner) => inner.slice().reverse().join(" "))
    .filter((line) => line.length > 0)
    .join(" ");
}
