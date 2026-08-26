(function () {
  var btn = document.getElementById("about-btn");
  var overlay = document.getElementById("about-overlay");
  var close = document.getElementById("about-close");
  if (!btn || !overlay) return;

  function open() { overlay.hidden = false; }
  function shut() { overlay.hidden = true; }

  btn.addEventListener("click", open);
  if (close) close.addEventListener("click", shut);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) shut();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) shut();
  });
})();
