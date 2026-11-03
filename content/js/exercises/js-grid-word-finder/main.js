const grid = [
  ["c", "a", "t"],
  ["a", "a", "t"],
  ["r", "a", "t"],
  ["d", "o", "g"],
];

console.log(
  gridWordsFinder(grid, ["cat", "dog", "rat", "tar", "car", "rac", "g"]),
);
console.log(gridWordsFinder(grid, []));
