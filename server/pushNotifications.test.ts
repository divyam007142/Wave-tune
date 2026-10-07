import assert from "node:assert/strict";
import test from "node:test";
import {
  getWavePushPublicKey,
  normalizeBrowserSubscription,
} from "./pushNotifications";

const validSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
  keys: {
    p256dh: "abcDEF0123456789_-abc",
    auth: "abcDEF0123456789_-abc",
  },
};

test("Wave Tune creates a stable, browser-compatible VAPID public key", () => {
  const publicKey = getWavePushPublicKey();
  assert.match(publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.equal(getWavePushPublicKey(), publicKey);
});

test("push subscriptions accept supported HTTPS browser push endpoints", () => {
  assert.deepEqual(normalizeBrowserSubscription(validSubscription), validSubscription);
  assert.equal(normalizeBrowserSubscription({
    ...validSubscription,
    endpoint: "https://updates.push.services.mozilla.com/wpush/v2/test-endpoint",
  })?.endpoint, "https://updates.push.services.mozilla.com/wpush/v2/test-endpoint");
});

test("push subscriptions reject insecure or untrusted endpoints", () => {
  assert.equal(normalizeBrowserSubscription({
    ...validSubscription,
    endpoint: "http://fcm.googleapis.com/fcm/send/test-endpoint",
  }), null);
  assert.equal(normalizeBrowserSubscription({
    ...validSubscription,
    endpoint: "https://fcm.googleapis.com.attacker.invalid/send/test-endpoint",
  }), null);
  assert.equal(normalizeBrowserSubscription({
    ...validSubscription,
    endpoint: "https://127.0.0.1/internal",
  }), null);
});
