import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, passwordValidationError, verifyPassword } from "./passwords";

test("password hashes are salted and verify only the matching password", async () => {
  const password = "a-long-example-passphrase";
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword("a-different-passphrase", firstHash), false);
});

test("password validation enforces length limits", () => {
  assert.match(passwordValidationError("short") ?? "", /at least 12/);
  assert.equal(passwordValidationError("a-secure-long-passphrase"), undefined);
  assert.match(passwordValidationError("x".repeat(129)) ?? "", /no more than 128/);
});

test("malformed and absent hashes never authenticate", async () => {
  assert.equal(await verifyPassword("a-long-example-passphrase"), false);
  assert.equal(await verifyPassword("a-long-example-passphrase", "not-a-scrypt-hash"), false);
});
