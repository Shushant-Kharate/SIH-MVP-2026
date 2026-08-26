const forms = document.querySelectorAll("[data-demo-form]");

for (const form of forms) {
  const outcome = form.parentElement.querySelector("[data-form-outcome]");
  const submitButton = form.querySelector("button[type='submit']");
  const defaultButtonText = submitButton?.textContent ?? "Submit application";

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    if (outcome) {
      outcome.hidden = false;
      outcome.focus();
    }
    if (submitButton) {
      submitButton.textContent = "Submitted locally";
      submitButton.disabled = true;
    }

    form.dataset.localSubmission = "complete";
    document.dispatchEvent(new CustomEvent("privacyfill:demo-submitted", {
      detail: { formId: form.dataset.demoForm },
    }));
  });

  form.addEventListener("reset", () => {
    window.setTimeout(() => {
      if (outcome) outcome.hidden = true;
      if (submitButton) {
        submitButton.textContent = defaultButtonText;
        submitButton.disabled = false;
      }
      delete form.dataset.localSubmission;
    }, 0);
  });
}
