window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const target = params.get("url");
  if (!target) return;
  const addressInput = document.getElementById("sj-address");
  const form = document.getElementById("sj-form");
  if (!addressInput || !form) return;
  addressInput.value = target;
  if (form.requestSubmit) {
    form.requestSubmit();
  } else {
    form.dispatchEvent(new Event("submit", { cancelable: true }));
  }
});
