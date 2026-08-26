// emulator.js - wires up the v86 emulator page.
// Presets boot from copy.sh's public demo images (small, free, always up).
// Uploaded files never leave the browser - v86 reads them locally via the File API.

(function () {
var optionsSection = document.getElementById("options-section");
var vmWrap = document.getElementById("vm-wrap");
var vmStatus = document.getElementById("vm-status");
var autosaveStatus = document.getElementById("autosave-status");
var screenContainer = document.getElementById("screen_container");
var scrollToOptionsBtn = document.getElementById("scroll-to-options");
var scrollHint = document.getElementById("scroll-hint");

var uploadTrigger = document.getElementById("upload-trigger");
var fileInput = document.getElementById("file-input");
var uploadPanel = document.getElementById("upload-panel");
var uploadFilename = document.getElementById("upload-filename");
var typeBtns = document.querySelectorAll(".type-btn");
var bootUploadBtn = document.getElementById("boot-upload-btn");

var rememberedPanel = document.getElementById("remembered-panel");
var rememberedFilename = document.getElementById("remembered-filename");
var bootRememberedBtn = document.getElementById("boot-remembered-btn");
var forgetRememberedBtn = document.getElementById("forget-remembered-btn");

var saveStateBtn = document.getElementById("save-state-btn");
var loadStateBtn = document.getElementById("load-state-btn");
var resetBtn = document.getElementById("reset-btn");
var stopBtn = document.getElementById("stop-btn");
var fullscreenBtn = document.getElementById("fullscreen-btn");

var emulator = null;
var pendingFile = null;
var pendingSlot = "cdrom"; // "cdrom" or "hda"
var STATE_DB_KEY = "cinder-emulator-state";
var DISK_DB_KEY = "cinder-emulator-disk";
var hasUnsavedChanges = false;
var autosaveTimer = null;
var AUTOSAVE_INTERVAL_MS = 60 * 1000;

function setStatus(text) {
vmStatus.textContent = text;
}

// The options section (picker) always stays in the page - it's reachable
// by scrolling up. Showing the VM just reveals the VM section and
// scrolls down to it, rather than hiding the picker outright.
function showVM() {
vmWrap.hidden = false;
if (scrollToOptionsBtn) scrollToOptionsBtn.hidden = false;
if (scrollHint) scrollHint.hidden = true;
vmWrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showPicker() {
vmWrap.hidden = true;
if (scrollToOptionsBtn) scrollToOptionsBtn.hidden = true;
optionsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- preset boot buttons (TinyCore Linux / FreeDOS) ----
document.querySelectorAll(".boot-btn[data-preset]").forEach(function (btn) {
btn.addEventListener("click", function () {
var preset = btn.getAttribute("data-preset");
if (preset === "linux") {
bootVM({
cdrom: { url: "https://copy.sh/v86/images/linux.iso" },
memory_size: 128 * 1024 * 1024,
vga_memory_size: 8 * 1024 * 1024,
});
} else if (preset === "freedos") {
bootVM({
fda: { url: "https://copy.sh/v86/images/freedos722.img" },
memory_size: 32 * 1024 * 1024,
vga_memory_size: 4 * 1024 * 1024,
});
}
});
});

// ---- upload flow ----
uploadTrigger.addEventListener("click", function () {
fileInput.click();
});

fileInput.addEventListener("change", function () {
var file = fileInput.files && fileInput.files[0];
if (!file) return;
pendingFile = file;
uploadFilename.textContent = file.name;
uploadPanel.hidden = false;

// guess a sane default slot from the extension
var lower = file.name.toLowerCase();
if (lower.endsWith(".iso")) {
setSlot("cdrom");
} else {
setSlot("hda");
}

// Remember this file in IndexedDB so it doesn't need to be
// re-uploaded on the next visit. Best-effort - if it fails (e.g.
// storage quota), the upload still works for this session.
idbPut(DISK_DB_KEY, { name: file.name, slot: pendingSlot, blob: file }).catch(
function () {}
);
});

// ---- remembered ISO (persisted upload from a previous visit) ----
function checkRememberedDisk() {
idbGet(DISK_DB_KEY)
.then(function (saved) {
if (!saved || !saved.blob) return;
rememberedFilename.textContent = saved.name || "uploaded file";
rememberedPanel.hidden = false;
})
.catch(function () {});
}

if (bootRememberedBtn) {
bootRememberedBtn.addEventListener("click", function () {
idbGet(DISK_DB_KEY)
.then(function (saved) {
if (!saved || !saved.blob) return;
var options = {
memory_size: 256 * 1024 * 1024,
vga_memory_size: 8 * 1024 * 1024,
};
options[saved.slot || "cdrom"] = { buffer: saved.blob };
bootVM(options);
})
.catch(function (err) {
setStatus("Couldn't load remembered file: " + err.message);
});
});
}

if (forgetRememberedBtn) {
forgetRememberedBtn.addEventListener("click", function () {
idbDelete(DISK_DB_KEY)
.then(function () {
rememberedPanel.hidden = true;
})
.catch(function () {});
});
}

function setSlot(slot) {
pendingSlot = slot;
typeBtns.forEach(function (b) {
b.classList.toggle("active", b.getAttribute("data-slot") === slot);
});
}

typeBtns.forEach(function (b) {
b.addEventListener("click", function () {
setSlot(b.getAttribute("data-slot"));
});
});

bootUploadBtn.addEventListener("click", function () {
if (!pendingFile) return;
var options = {
memory_size: 256 * 1024 * 1024,
vga_memory_size: 8 * 1024 * 1024,
};
options[pendingSlot] = { buffer: pendingFile };
bootVM(options);
});

// ---- boot ----
function bootVM(diskConfig) {
showVM();
setStatus("Starting...");

var config = Object.assign(
{
wasm_path: "v86/v86.wasm",
screen_container: screenContainer,
bios: { url: "v86/seabios.bin" },
vga_bios: { url: "v86/vgabios.bin" },
autostart: true,
},
diskConfig
);

try {
emulator = new V86(config);
} catch (e) {
setStatus("Failed to start: " + e.message);
return;
}

emulator.add_listener("emulator-ready", function () {
setStatus("Running");
});
emulator.add_listener("emulator-loaded", function () {
setStatus("Running");
});

hasUnsavedChanges = true;
startAutosave();

// v86 fails silently on a failed image/BIOS fetch (wrong URL, CORS
// block, network error, etc.) unless this is wired up - without it,
// the status just sits on "Starting..." forever with a black screen
// and no indication anything went wrong.
emulator.add_listener("download-error", function (info) {
setStatus(
"Couldn't load " +
(info && info.file_name ? info.file_name : "a required file") +
" - check your connection and try again."
);
});

emulator.add_listener("download-progress", function (info) {
if (!info || !info.lengthComputable) return;
var pct = Math.round((info.loaded / info.total) * 100);
setStatus("Downloading " + info.file_name + "... " + pct + "%");
});
}

// ---- state storage (IndexedDB - localStorage's ~5-10MB quota is far too
// small for a VM snapshot, which is easily 30-300MB+ depending on RAM size) ----
var STATE_DB_NAME = "cinder-emulator-db";
var STATE_STORE = "states";

function openStateDB() {
return new Promise(function (resolve, reject) {
var req = indexedDB.open(STATE_DB_NAME, 1);
req.onupgradeneeded = function () {
req.result.createObjectStore(STATE_STORE);
};
req.onsuccess = function () {
resolve(req.result);
};
req.onerror = function () {
reject(req.error);
};
});
}

function idbPut(key, value) {
return openStateDB().then(function (db) {
return new Promise(function (resolve, reject) {
var tx = db.transaction(STATE_STORE, "readwrite");
tx.objectStore(STATE_STORE).put(value, key);
tx.oncomplete = function () {
resolve();
};
tx.onerror = function () {
reject(tx.error);
};
});
});
}

function idbGet(key) {
return openStateDB().then(function (db) {
return new Promise(function (resolve, reject) {
var tx = db.transaction(STATE_STORE, "readonly");
var req = tx.objectStore(STATE_STORE).get(key);
req.onsuccess = function () {
resolve(req.result);
};
req.onerror = function () {
reject(req.error);
};
});
});
}

function idbDelete(key) {
return openStateDB().then(function (db) {
return new Promise(function (resolve, reject) {
var tx = db.transaction(STATE_STORE, "readwrite");
tx.objectStore(STATE_STORE).delete(key);
tx.oncomplete = function () {
resolve();
};
tx.onerror = function () {
reject(tx.error);
};
});
});
}

// ---- autosave (every 60s while a VM is running) ----
function formatClock(date) {
var h = date.getHours().toString().padStart(2, "0");
var m = date.getMinutes().toString().padStart(2, "0");
var s = date.getSeconds().toString().padStart(2, "0");
return h + ":" + m + ":" + s;
}

function setAutosaveStatus(text) {
if (!autosaveStatus) return;
if (!text) {
autosaveStatus.hidden = true;
autosaveStatus.textContent = "";
return;
}
autosaveStatus.hidden = false;
autosaveStatus.textContent = text;
}

function doAutosave() {
if (!emulator) return;
emulator
.save_state()
.then(function (state) {
return idbPut(STATE_DB_KEY, state);
})
.then(function () {
hasUnsavedChanges = false;
setAutosaveStatus("Auto-saved " + formatClock(new Date()));
})
.catch(function () {
setAutosaveStatus("Auto-save failed");
});
}

function startAutosave() {
stopAutosave();
// Tests can shorten the interval via window.__autosaveIntervalOverride
// instead of waiting out the real 60s; unset in production.
var interval = window.__autosaveIntervalOverride || AUTOSAVE_INTERVAL_MS;
autosaveTimer = setInterval(doAutosave, interval);
}

function stopAutosave() {
if (autosaveTimer) {
clearInterval(autosaveTimer);
autosaveTimer = null;
}
setAutosaveStatus(null);
}

// ---- warn before leaving with unsaved changes ----
window.addEventListener("beforeunload", function (event) {
if (!emulator || !hasUnsavedChanges) return;
event.preventDefault();
event.returnValue = "";
return "";
});

// ---- toolbar ----
saveStateBtn.addEventListener("click", function () {
if (!emulator) return;
setStatus("Saving state...");
// v86's save_state() returns a Promise<ArrayBuffer> (not a callback).
emulator
.save_state()
.then(function (state) {
return idbPut(STATE_DB_KEY, state);
})
.then(function () {
hasUnsavedChanges = false;
setAutosaveStatus("Auto-saved " + formatClock(new Date()));
setStatus("State saved");
})
.catch(function (err) {
setStatus("Save failed: " + err.message);
});
});

loadStateBtn.addEventListener("click", function () {
if (!emulator) return;
setStatus("Loading state...");
idbGet(STATE_DB_KEY)
.then(function (state) {
if (!state) {
setStatus("No saved state found");
return;
}
// v86's restore_state() returns a Promise<void>.
return emulator.restore_state(state).then(function () {
hasUnsavedChanges = false;
setStatus("Running");
});
})
.catch(function (err) {
setStatus("Load failed: " + err.message);
});
});

resetBtn.addEventListener("click", function () {
if (!emulator) return;
emulator.restart();
setStatus("Restarted");
});

stopBtn.addEventListener("click", function () {
if (!emulator) return;
emulator.stop();
emulator = null;
pendingFile = null;
hasUnsavedChanges = false;
stopAutosave();
fileInput.value = "";
uploadPanel.hidden = true;
showPicker();
setStatus("Starting...");
});

// ---- fullscreen ----
function requestFS(el) {
if (el.requestFullscreen) return el.requestFullscreen();
if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
if (el.msRequestFullscreen) return el.msRequestFullscreen();
return Promise.reject(new Error("Fullscreen isn't supported in this browser"));
}

function exitFS() {
if (document.exitFullscreen) return document.exitFullscreen();
if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
if (document.msExitFullscreen) return document.msExitFullscreen();
return Promise.resolve();
}

function currentFSElement() {
return (
document.fullscreenElement ||
document.webkitFullscreenElement ||
document.msFullscreenElement ||
null
);
}

if (fullscreenBtn) {
fullscreenBtn.addEventListener("click", function () {
if (currentFSElement()) {
exitFS();
return;
}
var req = requestFS(screenContainer);
if (req && req.catch) {
req.catch(function (err) {
setStatus(
"Fullscreen blocked: " + (err && err.message ? err.message : "try again")
);
});
}
});
["fullscreenchange", "webkitfullscreenchange", "msfullscreenchange"].forEach(
function (evtName) {
document.addEventListener(evtName, function () {
fullscreenBtn.textContent = currentFSElement()
? "Exit Fullscreen"
: "Fullscreen";
});
}
);
}

// ---- scroll navigation ----
if (scrollToOptionsBtn) {
scrollToOptionsBtn.addEventListener("click", function () {
optionsSection.scrollIntoView({ behavior: "smooth", block: "start" });
});
}
// Let first-time visitors know the screen is below the fold once a VM
// exists to boot into (shown until the VM actually starts).
if (scrollHint) scrollHint.hidden = false;

checkRememberedDisk();
})();