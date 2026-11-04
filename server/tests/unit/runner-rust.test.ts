import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchCommand } from '../../src/services/runner/rust.js';

test('rust runs re-stamp the written files, quoted, under /workspace', () => {
  assert.equal(touchCommand([]), '');
  assert.equal(
    touchCommand(['matrix_multiplication/src/lib.rs', "/odd'name/x.rs"]),
    "touch -c -- '/workspace/matrix_multiplication/src/lib.rs' '/workspace/odd'\\''name/x.rs'; ",
  );
});
