(function () {
  var KEY = "cinder-engine";
  var engineInput = document.getElementById("sj-search-engine");
  var buttons = document.querySelectorAll(".engine-btn");
  var saved = localStorage.getItem(KEY) || "ddg";

  function setEngine(name) {
    var btn = document.querySelector(".engine-btn[data-engine=\"" + name + "\"]");
    if (!btn || !engineInput) return;
    engineInput.value = btn.getAttribute("data-url");
    buttons.forEach(function (b) { b.classList.toggle("active", b === btn); });
    try { localStorage.setItem(KEY, name); } catch (e) {}
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () { setEngine(b.getAttribute("data-engine")); });
  });

  setEngine(saved);

  var form = document.getElementById("sj-form");
  var addr = document.getElementById("sj-address");
  var spinner = document.getElementById("sj-spinner");

  if (form) {
    form.addEventListener("submit", function () {
      if (spinner) spinner.hidden = false;
      if (addr) addr.disabled = true;
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== addr) {
      e.preventDefault();
      if (addr) addr.focus();
    }
  });
})();
