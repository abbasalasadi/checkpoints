function pipeline(initialValue, functions) {
  const steps = [];
  const finalValue = functions.reduce((input, fn, index) => {
    const output = fn(input);
    steps.push({ index, input, output });
    return output;
  }, initialValue);

  return { finalValue, steps };
}
