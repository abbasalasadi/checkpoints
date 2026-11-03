function isPerfectNum(n) {
  if (n <= 1) return false;
  let sum = 1;
  for (let i = 2; i * i <= n; i++) {
    if (n % i !== 0) continue;
    sum += i;
    const pair = n / i;
    if (pair !== i) sum += pair;
  }
  return sum === n;
}
