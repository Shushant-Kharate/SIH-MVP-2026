function canonicalField(field) {
  return {
    fieldId: field.fieldId,
    formId: field.formId,
    tag: field.tag,
    type: field.type,
    label: field.label,
    required: field.required,
    disabled: field.disabled,
    readonly: field.readonly,
    options: [...field.options],
    category: field.classification.category,
    risk: field.classification.risk,
  };
}

export function createSnapshotMaterial(fields) {
  return JSON.stringify(fields.map(canonicalField));
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createSnapshotId(fields) {
  return `snapshot-v1-${fnv1a32(createSnapshotMaterial(fields))}`;
}
