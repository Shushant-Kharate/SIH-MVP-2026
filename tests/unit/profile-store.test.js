import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  clearSessionProfile,
  getSessionProfile,
  getSessionProfileStatus,
  PROFILE_STORAGE_KEY,
  restrictSessionStorageAccess,
  saveSessionProfile,
} from "../../extension/src/core/profile-store.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

let storedValues;
let configuredAccessLevel;

beforeEach(() => {
  storedValues = {};
  configuredAccessLevel = null;
  globalThis.chrome = {
    storage: {
      session: {
        async get(key) {
          return { [key]: storedValues[key] };
        },
        async remove(key) {
          delete storedValues[key];
        },
        async set(record) {
          Object.assign(storedValues, structuredClone(record));
        },
        async setAccessLevel(options) {
          configuredAccessLevel = options;
        },
      },
    },
  };
});

afterEach(() => {
  delete globalThis.chrome;
});

describe("session profile store", () => {
  it("restricts session storage to trusted extension contexts", async () => {
    await restrictSessionStorageAccess();
    assert.deepEqual(configuredAccessLevel, { accessLevel: "TRUSTED_CONTEXTS" });
  });

  it("saves values but returns only safe status metadata", async () => {
    const status = await saveSessionProfile(FAKE_PROFILE);
    const stored = await getSessionProfile();

    assert.equal(status.hasProfile, true);
    assert.equal(status.availableProfileKeys.length, 7);
    assert.equal(Object.hasOwn(status, "values"), false);
    assert.deepEqual(stored.values, FAKE_PROFILE);
    assert.equal(storedValues[PROFILE_STORAGE_KEY].version, 1);
  });

  it("does not write an invalid profile", async () => {
    await assert.rejects(
      () => saveSessionProfile({}),
      (error) => error.code === "PROFILE_INVALID",
    );
    assert.deepEqual(storedValues, {});
  });

  it("clears the profile and reports an empty session", async () => {
    await saveSessionProfile(FAKE_PROFILE);
    const clearedStatus = await clearSessionProfile();

    assert.equal(clearedStatus.hasProfile, false);
    assert.equal(await getSessionProfile(), null);
    assert.deepEqual(await getSessionProfileStatus(), clearedStatus);
  });
});
