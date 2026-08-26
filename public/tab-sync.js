(function () {
  var iconTag = document.querySelector("link[rel~=\"icon\"]");
  var defaultTitle = document.title;
  var defaultIcon = iconTag ? iconTag.getAttribute("href") : null;
  var pollId = null;

  function sync(frame) {
    try {
      var doc = frame.contentDocument;
      if (!doc) return;
      if (doc.title) document.title = doc.title;
      var innerIcon = doc.querySelector("link[rel~=\"icon\"]");
      if (innerIcon && innerIcon.href && iconTag) {
        iconTag.setAttribute("href", innerIcon.href);
      }
    } catch (e) {}
  }

  function attach(frame) {
    frame.addEventListener("load", function () { sync(frame); });
    pollId = setInterval(function () { sync(frame); }, 1500);
  }

  function reset() {
    if (pollId) { clearInterval(pollId); pollId = null; }
    document.title = defaultTitle;
    if (iconTag && defaultIcon) iconTag.setAttribute("href", defaultIcon);
  }

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.addedNodes) m.addedNodes.forEach(function (node) {
        if (node.id === "sj-frame") attach(node);
      });
      if (m.removedNodes) m.removedNodes.forEach(function (node) {
        if (node.id === "sj-frame") reset();
      });
    });
  });
  observer.observe(document.body, { childList: true });

  var existing = document.getElementById("sj-frame");
  if (existing) attach(existing);
})();
