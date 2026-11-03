/**
 * Content acceptance gate, one language at a time:
 *   every reference solution passes its official test, every starter fails it.
 *
 *   npx tsx tools/verify.ts --lang go|js|rust [--only slug,slug] [...language flags]
 *
 * Runs against local toolchains (go / node / cargo) in scratch trees under
 * var/verify/<lang>/. Language-specific extras:
 *   go    --no-negative   skip the starter-must-fail sweep
 *   js    --allow-missing tolerate exercises without solution.js
 *   rust  also checks every starter is exactly the README's expected code
 */

import { parseLang } from './lib/content.js';

const lang = parseLang(process.argv.slice(2));
await import(`./verify/${lang}.js`);
