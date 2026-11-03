function gridWordsFinder(rows, words) {
  const horizontal = rows.map((row) => row.join(""));
  const vertical = (rows[0] || []).map((_, column) => rows.map((row) => row[column]).join(""));
  const lines = [...horizontal, ...vertical];
  return words.filter((word) => word.length > 0 && lines.some((line) => line.includes(word)));
}
