import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSnapshotId, createSnapshotMaterial } from "../../extension/src/core/snapshot.js";

function field(overrides = {}) {
  return {
    fieldId: "FIELD_1",
    formId: "FORM_1",
    tag: "input",
    type: "text",
    label: "Applicant name",
    required: true,
    disabled: false,
    readonly: false,
    options: [],
    classification: { category: "PROFILE.NAME", risk: "medium" },
    ...overrides,
  };
}

describe("form snapshots", () => {
  it("is deterministic for identical safe metadata", () => {
    const fields = [field()];
    assert.equal(createSnapshotId(fields), createSnapshotId(structuredClone(fields)));
    assert.match(createSnapshotId(fields), /^snapshot-v1-[a-f0-9]{8}$/);
  });

  it("changes when material form metadata changes", () => {
    const original = createSnapshotId([field()]);
    for (const changed of [
      field({ label: "Candidate name" }),
      field({ type: "email" }),
      field({ required: false }),
      field({ options: ["One"] }),
    ]) assert.notEqual(createSnapshotId([changed]), original);
  });

  it("excludes unrelated and value-like properties", () => {
    const material = createSnapshotMaterial([field({
      value: "Aarav Demo Sharma",
      outerHTML: "<input value='secret'>",
    })]);

    assert.equal(material.includes("Aarav Demo Sharma"), false);
    assert.equal(material.includes("outerHTML"), false);
  });
});
