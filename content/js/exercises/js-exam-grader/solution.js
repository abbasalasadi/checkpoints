async function examGrader(timeout, exercises) {
  const startedAt = Date.now();
  let finalGrade = 0;

  for (const exercise of exercises) {
    const result = await exercise();
    if (Date.now() - startedAt >= timeout) break;
    finalGrade += result.note;
  }

  return finalGrade;
}
