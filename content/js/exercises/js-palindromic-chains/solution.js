function palindromicChain(numbers) {
  const reverseDigits = (value) => Number(String(value).split("").reverse().join(""));
  const isPalindrome = (value) => value === reverseDigits(value);

  return numbers.map((number) => {
    let current = number;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (isPalindrome(current)) return current;
      current += reverseDigits(current);
    }
    return 0;
  });
}
