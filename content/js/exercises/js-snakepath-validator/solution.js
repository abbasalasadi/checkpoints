function isSnakePath(rows) {
  const cells = rows.flatMap((row, y) => row.map((value, x) => (value === 1 ? `${x},${y}` : null)));
  const ones = new Set(cells.filter(Boolean));
  if (ones.size === 0) return false;

  const visit = (key) => {
    if (!ones.has(key)) return;
    ones.delete(key);
    const [x, y] = key.split(",").map(Number);
    [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ].forEach(([nx, ny]) => visit(`${nx},${ny}`));
  };

  const start = ones.values().next().value;
  visit(start);
  return ones.size === 0;
}
