const data = {
  user: "Alice",
  stats: {
    score: 100,
    achievements: ["gold", "silver"],
  },
};

deepFreeze(data);

// All three should fail. The assignments fail silently outside strict mode; push throws whatever
// the mode, so the attempts are wrapped to let the program reach its own output.
try {
  data.user = "Bob";
  data.stats.score = 200;
  data.stats.achievements.push("bronze");
} catch (error) {
  console.log("Modification refused:", error.message);
}

console.log(data);
