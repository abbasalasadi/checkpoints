function animal(name, maxSpeed, maxSpeedRange, midSpeed, midSpeedRange, speed, distance) {
  let seconds;

  if (distance <= maxSpeedRange) {
    seconds = distance / maxSpeed;
  } else if (distance <= maxSpeedRange + midSpeedRange) {
    seconds = maxSpeedRange / maxSpeed + (distance - maxSpeedRange) / midSpeed;
  } else {
    seconds =
      maxSpeedRange / maxSpeed +
      midSpeedRange / midSpeed +
      (distance - maxSpeedRange - midSpeedRange) / speed;
  }

  return new Promise((resolve) => setTimeout(() => resolve(name), seconds * 1000));
}

function zooRace(animals) {
  return Promise.race(animals);
}
