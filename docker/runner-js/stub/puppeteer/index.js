// The upstream harness imports puppeteer at module scope, but only ever calls launch() for
// exercises whose slug ends in "-dom". None of the 132 archived tests are DOM tests, so this
// stub satisfies the import and keeps Chromium out of the image. If a DOM exercise is ever
// added, this throws loudly instead of failing in some subtle way.
export default {
  launch() {
    throw Error(
      "puppeteer stub: this image has no browser. Rebuild on the official module-js image to run DOM exercises.",
    );
  },
};
