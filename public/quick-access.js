(function () {
  var KEY = "cinder-quick-access";
  var addr = document.getElementById("sj-address");
  var saveBtn = document.getElementById("sj-save");
  var clearBtn = document.getElementById("sj-clear");
  var chipRow = document.getElementById("chip-row");
  var label = document.getElementById("quick-access-label");
  var form = document.getElementById("sj-form");

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  function persist(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }
  function labelFor(url) {
    try {
      var u = new URL(url.indexOf("://") === -1 ? "https://" + url : url);
      return u.hostname.replace(/^www\./, "");
    } catch (e) { return url; }
  }

  function render() {
    var list = load();
    chipRow.innerHTML = "";
    if (label) label.hidden = list.length === 0;
    list.forEach(function (item, i) {
      var chip = document.createElement("div");
      chip.className = "chip";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-btn";
      btn.textContent = item.name;
      btn.addEventListener("click", function () {
        addr.value = item.url;
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { cancelable: true }));
      });
      var rm = document.createElement("span");
      rm.className = "chip-remove";
      rm.textContent = "\u00d7";
      rm.title = "Remove";
      rm.addEventListener("click", function (e) {
        e.stopPropagation();
        list.splice(i, 1);
        persist(list);
        render();
      });
      chip.appendChild(btn);
      chip.appendChild(rm);
      chipRow.appendChild(chip);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
      var url = (addr.value || "").trim();
      if (!url) return;
      var name = window.prompt("Name for this shortcut?", labelFor(url));
      if (name === null) return;
      name = name.trim() || labelFor(url);
      var list = load();
      list.push({ name: name, url: url });
      persist(list);
      render();
    });
  }

  if (addr && clearBtn) {
    addr.addEventListener("input", function () {
      clearBtn.hidden = addr.value.length === 0;
    });
    clearBtn.addEventListener("click", function () {
      addr.value = "";
      clearBtn.hidden = true;
      addr.focus();
    });
  }
  if (form && clearBtn) {
    form.addEventListener("submit", function () { clearBtn.hidden = true; });
  }

  render();
})();
