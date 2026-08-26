import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { ACTION_TYPES } from "../../shared/action-types.js";
import { PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import {
  appendAuditEntries,
  AUDIT_STORAGE_KEY,
  clearAuditEntries,
  createAuditEntry,
  getAuditEntries,
  MAX_AUDIT_ENTRIES,
} from "../../extension/src/core/audit-log.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

function installSessionStorage() {
  const values = {};
  globalThis.chrome = {
    storage: {
      session: {
        async get(key) { return { [key]: values[key] }; },
        async set(entries) { Object.assign(values, entries); },
        async remove(key) { delete values[key]; },
      },
    },
  };
  return values;
}

afterEach(() => { delete globalThis.chrome; });

describe("privacy-safe audit log", () => {
  it("allowlists metadata and discards arbitrary properties", () => {
    const entry = createAuditEntry({
      timestamp: 123,
      fieldId: "FIELD_1",
      profileKey: PROFILE_KEYS.NAME,
      action: ACTION_TYPES.FILL_PRIVATE,
      status: "success",
      durationMs: 4.4,
      code: "OK",
      value: FAKE_PROFILE[PROFILE_KEYS.NAME],
    });

    assert.deepEqual(Object.keys(entry), [
      "timestamp", "fieldId", "profileKey", "action", "status", "durationMs", "code",
    ]);
    assert.equal(JSON.stringify(entry).includes(FAKE_PROFILE[PROFILE_KEYS.NAME]), false);
  });

  it("stores a bounded session-only audit history", async () => {
    const storage = installSessionStorage();
    const entries = Array.from({ length: MAX_AUDIT_ENTRIES + 5 }, (_, index) => ({
      timestamp: index,
      fieldId: `FIELD_${index}`,
      profileKey: PROFILE_KEYS.NAME,
      action: ACTION_TYPES.FILL_PRIVATE,
      status: "success",
      durationMs: index,
      code: "OK",
    }));

    assert.equal(await appendAuditEntries(entries), MAX_AUDIT_ENTRIES);
    assert.equal((await getAuditEntries()).length, MAX_AUDIT_ENTRIES);
    assert.equal(storage[AUDIT_STORAGE_KEY][0].fieldId, "FIELD_5");
    await clearAuditEntries();
    assert.deepEqual(await getAuditEntries(), []);
  });
});
