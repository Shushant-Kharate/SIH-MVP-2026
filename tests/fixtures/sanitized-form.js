import { CONTRACT_VERSION } from "../../shared/contracts.js";
import { PROFILE_KEYS } from "../../shared/pii-taxonomy.js";

export function createSanitizedPlanningRequest() {
  return {
    contractVersion: CONTRACT_VERSION,
    requestId: "request-demo-001",
    snapshotId: "snapshot-demo-001",
    task: "Fill this application form using my saved profile",
    availableProfileKeys: [
      PROFILE_KEYS.NAME,
      PROFILE_KEYS.EMAIL,
      PROFILE_KEYS.PHONE,
    ],
    fields: [
      {
        fieldId: "FIELD_1",
        formId: "FORM_1",
        tag: "input",
        type: "text",
        label: "Applicant full name",
        required: true,
        options: [],
        suggestedProfileKey: PROFILE_KEYS.NAME,
        risk: "medium",
      },
      {
        fieldId: "FIELD_2",
        formId: "FORM_1",
        tag: "input",
        type: "email",
        label: "Email address",
        required: true,
        options: [],
        suggestedProfileKey: PROFILE_KEYS.EMAIL,
        risk: "medium",
      },
      {
        fieldId: "FIELD_3",
        formId: "FORM_1",
        tag: "select",
        type: "select",
        label: "Course",
        required: true,
        options: ["Engineering", "Medicine", "Arts"],
        suggestedProfileKey: null,
        risk: "low",
      },
    ],
  };
}
