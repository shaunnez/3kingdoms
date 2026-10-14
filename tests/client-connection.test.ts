import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_SERVER,
  basicRepeatDue,
  identityToken,
  joinFailure,
  readInvite,
  rejoinDelay,
  serverEndpoint,
  writeInvite,
} from "../apps/client/src/network";

const page = (origin: string, search = "") => {
  const url = new URL(origin);
  return { origin: url.origin, hostname: url.hostname, search };
};
const none = { allowlist: [] };

test("the hosted page always talks to the server that served it", () => {
  assert.equal(
    serverEndpoint(
      page("https://play.example.test", "?server=https://evil.test"),
      { serverUrl: "https://other.test", allowlist: [] },
      true,
    ),
    "https://play.example.test",
  );
});

test("a ?server= link only works from loopback pages or allowlisted origins", () => {
  const link = "?server=https://game.example.test/";
  assert.equal(
    serverEndpoint(page("http://127.0.0.1:4177", link), none, false),
    "https://game.example.test",
  );
  assert.equal(
    serverEndpoint(page("https://somewhere.test", link), none, false),
    DEFAULT_SERVER,
    "a phishing link must not redirect testers",
  );
  assert.equal(
    serverEndpoint(
      page("https://somewhere.test", link),
      { allowlist: ["https://game.example.test"] },
      false,
    ),
    "https://game.example.test",
  );
  assert.equal(
    serverEndpoint(
      page("http://127.0.0.1:4177", "?server=javascript:1"),
      none,
      false,
    ),
    DEFAULT_SERVER,
  );
  assert.equal(
    serverEndpoint(
      page("https://somewhere.test"),
      { serverUrl: "https://built.example.test", allowlist: [] },
      false,
    ),
    "https://built.example.test",
  );
});

test("reconnects back off from one second to fifteen with jitter", () => {
  const mid = () => 0.5;
  assert.deepEqual(
    [1, 2, 3, 4, 5, 9].map((a) => rejoinDelay(a, mid)),
    [1000, 2000, 4000, 8000, 15000, 15000],
  );
  assert.equal(
    rejoinDelay(1, () => 0),
    800,
  );
  assert.equal(Math.round(rejoinDelay(1, () => 1)), 1200);
});

test("only definitive refusals stop the reconnect loop", () => {
  const refused = Object.assign(new Error("That invite key isn’t valid."), {
    code: 525,
  });
  assert.deepEqual(joinFailure(refused), {
    message: "That invite key isn’t valid.",
    permanent: true,
  });
  assert.equal(joinFailure({ code: 403 }).permanent, true);
  assert.equal(joinFailure({ code: 503 }).permanent, false);
  assert.deepEqual(joinFailure(new TypeError("fetch failed")), {
    message: null,
    permanent: false,
  });
});

test("held F repeats at the cooldown, never faster than seven a second", () => {
  // Not ready yet: wait.
  assert.equal(basicRepeatDue(10, 11, 1000, 50), false);
  // Just about ready (within the network lead): send at once.
  assert.equal(basicRepeatDue(10.9, 11, 0, 50), true);
  // Long past ready: throttled to one send per 140 ms.
  assert.equal(basicRepeatDue(20, 11, 100, 50), false);
  assert.equal(basicRepeatDue(20, 11, 140, 50), true);
  // Seven already sent in the last second: wait, even at the cooldown.
  assert.equal(basicRepeatDue(10.9, 11, 0, 50, 6), true);
  assert.equal(basicRepeatDue(10.9, 11, 0, 50, 7), false);
});

test("a held F stays under seven a second through cooldown windows", () => {
  // 1 s cooldown and a slow 300 ms round trip: the new cooldown only shows
  // up in a snapshot well after the attack lands.
  const rtt = 300,
    sent: number[] = [];
  let ready = 1,
    last = -Infinity;
  for (let ms = 0; ms < 10_000; ms += 70) {
    const seenNow = ms / 1000 - 0.1 - rtt / 2000;
    while (sent.length && ms - sent[0] >= 1000) sent.shift();
    if (basicRepeatDue(seenNow, ready, ms - last, rtt, sent.length)) {
      sent.push(ms);
      last = ms;
      const arrives = ms / 1000 + rtt / 2000;
      if (arrives >= ready) ready = arrives + 1;
    }
    assert.ok(sent.length <= 7, `${sent.length} sends in a second at ${ms} ms`);
  }
});

test("the identity token and invite key survive refused storage", () => {
  const values = new Map<string, string>();
  const store = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => void values.set(k, v),
  };
  const token = identityToken([store]);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(identityToken([store]), token);
  const refusing = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  const memory = identityToken([refusing]);
  assert.equal(identityToken([refusing]), memory, "page memory keeps one id");

  writeInvite("  key-for-wren  ", store);
  assert.equal(readInvite(store), "key-for-wren");
});
