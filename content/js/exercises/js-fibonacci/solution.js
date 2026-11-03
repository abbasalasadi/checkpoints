function fibonacci(n) {
  let [previous, current] = [0, 1];
  for (let i = 0; i < n; i++) [previous, current] = [current, previous + current];
  return previous;
}
