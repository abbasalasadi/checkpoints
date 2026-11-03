function gridWordFinder2(rows, word) {
  if (!word) return [];

  const offsetsOf = (line, from = 0) => {
    const at = line.indexOf(word, from);
    return at === -1 ? [] : [at, ...offsetsOf(line, at + 1)];
  };

  const horizontal = rows.flatMap((row, y) =>
    offsetsOf(row.join("")).map((x) => ({ x, y, direction: "horizontal" })),
  );

  const vertical = (rows[0] || []).flatMap((_, x) =>
    offsetsOf(rows.map((row) => row[x]).join("")).map((y) => ({ x, y, direction: "vertical" })),
  );

  return [...horizontal, ...vertical];
}
