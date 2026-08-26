// emulator.js - wires up the v86 emulator page.
// Presets boot from copy.sh's public demo images (small, free, always up).
// Uploaded files never leave the browser - v86 reads them locally via the File API.

(function () {
	var picker = document.getElementById("picker");
	var vmWrap = document.getElementById("vm-wrap");
	var vmStatus = document.getElementById("vm-status");
	var screenContainer = document.getElementById("screen_container");

	var uploadTrigger = document.getElementById("upload-trigger");
	var fileInput = document.getElementById("file-input");
	var uploadPanel = document.getElementById("upload-panel");
	var uploadFilename = document.getElementById("upload-filename");
	var typeBtns = document.querySelectorAll(".type-btn");
	var bootUploadBtn = document.getElementById("boot-upload-btn");

	var saveStateBtn = document.getElementById("save-state-btn");
	var loadStateBtn = document.getElementById("load-state-btn");
	var resetBtn = document.getElementById("reset-btn");
	var stopBtn = document.getElementById("stop-btn");

	var emulator = null;
	var pendingFile = null;
	var pendingSlot = "cdrom"; // "cdrom" or "hda"
	var STATE_DB_KEY = "cinder-emulator-state";

	function setStatus(text) {
		vmStatus.textContent = text;
	}

	function showVM() {
		picker.hidden = true;
		vmWrap.hidden = false;
	}

	function showPicker() {
		vmWrap.hidden = true;
		picker.hidden = false;
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
	});

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
		fileInput.value = "";
		uploadPanel.hidden = true;
		showPicker();
		setStatus("Starting...");
	});
})();