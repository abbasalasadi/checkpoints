function sentencePyramid(sentence) {
  const words = sentence.split(/\s+/).filter(Boolean);
  for (let i = 1; i <= words.length; i++) {
    console.log(words.slice(0, i).join(" "));
  }
}
