function divisors(n) {
  const target = Math.abs(n);
  const found = [];
  for (let i = 1; i < target; i++) {
    if (target % i === 0) found.push(i);
  }
  return found;
}
