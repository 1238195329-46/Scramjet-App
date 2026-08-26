# cinder-emulator-deploy.ps1  (v2 — verified/stable)
# Adds the v86-based in-browser emulator to Cinder, with a top-right
# "Emulator" button on the home page. Downloads the v86 engine files from
# their official npm package + GitHub repo, writes the new emulator page/
# CSS/JS (already booted and tested in a real headless browser before this
# script was written), patches index.html, and deploys through the same
# dev -> main workflow as everything else.
#
# Run this from INSIDE your cinder repo folder:
#   cd C:\Users\Temmie\Scramjet-App
#   .\cinder-emulator-deploy.ps1

$ErrorActionPreference = "Stop"

function Say($msg)  { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "!! $msg" -ForegroundColor Yellow }

# ---------------------------------------------------------------- sanity check
Say "Checking we're in the right folder..."
if (-not (Test-Path "package.json") -or -not (Test-Path "public\index.js")) {
    throw "This doesn't look like the cinder repo. cd into it first, then re-run."
}
Write-Host "   ok"

# ---------------------------------------------------------------- safety net
Say "Making a rollback point + switching to dev branch..."
git tag -f "pre-emulator" | Out-Null
$branches = git branch --list dev
if ([string]::IsNullOrWhiteSpace($branches)) {
    git checkout -b dev
} else {
    git checkout dev
    git merge main --no-edit
}
Write-Host "   on dev. tag 'pre-emulator' saved."

# ---------------------------------------------------------------- v86 engine files
# copy.sh (the usual demo host) blocks some automated fetchers, so this pulls the
# exact same files from their two official channels instead: the v86 npm package
# (engine + wasm) and the v86 GitHub repo itself (BIOS binaries).
Say "Getting the v86 emulator engine (one-time, a few MB)..."
$v86Dir = "public\v86"
New-Item -ItemType Directory -Force -Path $v86Dir | Out-Null

$needNpm = -not (Test-Path (Join-Path $v86Dir "libv86.js")) -or -not (Test-Path (Join-Path $v86Dir "v86.wasm"))
if ($needNpm) {
    Write-Host "   fetching engine via npm..."
    $tmpNpm = Join-Path $env:TEMP "cinder-v86-npm"
    Remove-Item -Recurse -Force $tmpNpm -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $tmpNpm | Out-Null
    Push-Location $tmpNpm
    npm init -y *> $null
    npm install v86 --no-save *> $null
    Pop-Location
    Copy-Item (Join-Path $tmpNpm "node_modules\v86\build\libv86.js") (Join-Path $v86Dir "libv86.js") -Force
    Copy-Item (Join-Path $tmpNpm "node_modules\v86\build\v86.wasm") (Join-Path $v86Dir "v86.wasm") -Force
    Write-Host "   engine ok"
} else {
    Write-Host "   engine already present, skipping"
}

$needBios = -not (Test-Path (Join-Path $v86Dir "seabios.bin")) -or -not (Test-Path (Join-Path $v86Dir "vgabios.bin"))
if ($needBios) {
    Write-Host "   fetching BIOS files from the v86 repo..."
    $tmpRepo = Join-Path $env:TEMP "cinder-v86-repo"
    Remove-Item -Recurse -Force $tmpRepo -ErrorAction SilentlyContinue
    git clone --depth 1 https://github.com/copy/v86.git $tmpRepo 2>&1 | Out-Null
    Copy-Item (Join-Path $tmpRepo "bios\seabios.bin") (Join-Path $v86Dir "seabios.bin") -Force
    Copy-Item (Join-Path $tmpRepo "bios\vgabios.bin") (Join-Path $v86Dir "vgabios.bin") -Force
    Remove-Item -Recurse -Force $tmpRepo -ErrorAction SilentlyContinue
    Write-Host "   BIOS ok"
} else {
    Write-Host "   BIOS already present, skipping"
}
Write-Host "   v86 engine ready in public\v86\"

# ---------------------------------------------------------------- emulator.html
Say "Writing public\emulator.html..."
@'
<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta
			name="viewport"
			content="width=device-width, initial-scale=1.0, shrink-to-fit=no"
		/>
		<title>Cinder Emulator</title>
		<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%94%A5%3C/text%3E%3C/svg%3E" />
		<link rel="stylesheet" href="index.css" />
		<link rel="stylesheet" href="emulator.css" />
		<script src="v86/libv86.js"></script>
	</head>
	<body>
		<div class="ember-glow ember-glow-1"></div>
		<div class="ember-glow ember-glow-2"></div>

		<a href="index.html" class="back-link">&larr; Back to Cinder</a>

		<div class="flex-center logo-wrapper header-center">
			<h1>Emulator<span class="cursor">&nbsp;</span></h1>
		</div>
		<div class="flex-center desc left-margin">
			<p>A real computer, simulated right in this tab. Pick something to boot.</p>
		</div>

		<div id="picker" class="picker">
			<div class="boot-options">
				<button type="button" class="boot-btn" data-preset="linux">
					<strong>TinyCore Linux</strong>
					<span>Small, fast, boots in seconds</span>
				</button>
				<button type="button" class="boot-btn" data-preset="freedos">
					<strong>FreeDOS</strong>
					<span>For old DOS games and software</span>
				</button>
				<button type="button" class="boot-btn" id="upload-trigger">
					<strong>Upload your own</strong>
					<span>.iso, .img, or .vhd — stays on your device</span>
				</button>
				<input type="file" id="file-input" accept=".iso,.img,.vhd,.qcow2" hidden />
			</div>

			<div id="upload-panel" class="upload-panel" hidden>
				<p id="upload-filename" class="upload-filename"></p>
				<p class="upload-hint">Is this a boot/install disc (CD), or a hard disk image?</p>
				<div class="upload-type-row">
					<button type="button" class="type-btn active" data-slot="cdrom">CD-ROM (.iso)</button>
					<button type="button" class="type-btn" data-slot="hda">Hard Disk (.img/.vhd)</button>
				</div>
				<button type="button" id="boot-upload-btn" class="boot-go-btn">Boot this</button>
			</div>

			<p class="picker-note">
				Performance depends on your device — old software runs fine, modern
				software will be slow or may not boot at all. That's a hard limit of
				browser emulation, not a bug.
			</p>
		</div>

		<div id="vm-wrap" class="vm-wrap" hidden>
			<div class="vm-toolbar">
				<span id="vm-status" class="vm-status">Starting&hellip;</span>
				<div class="vm-actions">
					<button type="button" id="save-state-btn" class="vm-btn">Save State</button>
					<button type="button" id="load-state-btn" class="vm-btn">Load State</button>
					<button type="button" id="reset-btn" class="vm-btn">Reset</button>
					<button type="button" id="stop-btn" class="vm-btn vm-btn-stop">Stop</button>
				</div>
			</div>
			<div id="screen_container" class="screen_container">
				<div id="screen"></div>
				<canvas id="vga-canvas"></canvas>
			</div>
		</div>

		<script src="emulator.js" defer></script>
	</body>
</html>
'@ | Set-Content -Path "public\emulator.html" -Encoding UTF8 -NoNewline
Write-Host "   ok"

# ---------------------------------------------------------------- emulator.css
Say "Writing public\emulator.css..."
@'
/* emulator.css — matches Cinder's ember/fire theme */

.back-link {
	position: fixed;
	top: 24px;
	left: 24px;
	color: var(--text-dim);
	text-decoration: none;
	font-size: 0.9rem;
	border: 1px solid var(--border);
	padding: 8px 14px;
	border-radius: 8px;
	background: var(--panel);
	transition: color 0.15s, border-color 0.15s;
	z-index: 5;
}
.back-link:hover {
	color: var(--ember);
	border-color: var(--border-hover);
}

.picker {
	max-width: 640px;
	margin: 32px auto;
	padding: 0 20px;
}

.boot-options {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 14px;
	margin-top: 8px;
}

.boot-btn {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 4px;
	background: var(--panel);
	border: 1px solid var(--border);
	border-radius: 10px;
	padding: 16px 18px;
	color: var(--text);
	cursor: pointer;
	text-align: left;
	transition: border-color 0.15s, transform 0.1s, background 0.15s;
}
.boot-btn:hover {
	border-color: var(--border-hover);
	background: var(--ember-soft);
	transform: translateY(-1px);
}
.boot-btn strong {
	font-size: 1rem;
	color: var(--text);
}
.boot-btn span {
	font-size: 0.82rem;
	color: var(--text-dim);
}
.boot-btn#upload-trigger {
	grid-column: span 2;
}

.upload-panel {
	margin-top: 18px;
	background: var(--panel);
	border: 1px solid var(--border);
	border-radius: 10px;
	padding: 18px;
}
.upload-filename {
	font-size: 0.9rem;
	color: var(--ember);
	word-break: break-all;
	margin: 0 0 10px;
}
.upload-hint {
	font-size: 0.85rem;
	color: var(--text-dim);
	margin: 0 0 10px;
}
.upload-type-row {
	display: flex;
	gap: 10px;
	margin-bottom: 14px;
}
.type-btn {
	flex: 1;
	background: transparent;
	border: 1px solid var(--border);
	border-radius: 8px;
	padding: 8px 10px;
	color: var(--text-dim);
	cursor: pointer;
	font-size: 0.85rem;
	transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.type-btn.active {
	border-color: var(--ember);
	color: var(--ember);
	background: var(--ember-soft);
}
.boot-go-btn {
	width: 100%;
	background: var(--ember-dim);
	border: 1px solid var(--ember);
	border-radius: 8px;
	padding: 10px;
	color: #fff;
	font-weight: 600;
	cursor: pointer;
	transition: background 0.15s;
}
.boot-go-btn:hover {
	background: var(--ember);
}

.picker-note {
	margin-top: 18px;
	font-size: 0.8rem;
	color: var(--text-dim);
	line-height: 1.5;
}

.vm-wrap {
	max-width: 900px;
	margin: 24px auto;
	padding: 0 20px;
}
.vm-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 10px;
	flex-wrap: wrap;
	gap: 10px;
}
.vm-status {
	font-size: 0.85rem;
	color: var(--text-dim);
}
.vm-actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
.vm-btn {
	background: var(--panel);
	border: 1px solid var(--border);
	border-radius: 6px;
	padding: 6px 12px;
	color: var(--text);
	font-size: 0.82rem;
	cursor: pointer;
	transition: border-color 0.15s, color 0.15s;
}
.vm-btn:hover {
	border-color: var(--border-hover);
	color: var(--ember);
}
.vm-btn-stop:hover {
	border-color: #d9534f;
	color: #d9534f;
}

.screen_container {
	position: relative;
	background: #000;
	border: 1px solid var(--border);
	border-radius: 10px;
	overflow: auto;
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 400px;
}
.screen_container canvas,
.screen_container div#screen {
	image-rendering: pixelated;
}

/* Emulator entry button on the Cinder home page */
.emulator-link {
	position: fixed;
	top: 24px;
	right: 24px;
	color: var(--text-dim);
	text-decoration: none;
	font-size: 0.9rem;
	border: 1px solid var(--border);
	padding: 8px 14px;
	border-radius: 8px;
	background: var(--panel);
	transition: color 0.15s, border-color 0.15s;
	z-index: 5;
}
.emulator-link:hover {
	color: var(--ember);
	border-color: var(--border-hover);
}

@media (max-width: 560px) {
	.boot-options {
		grid-template-columns: 1fr;
	}
	.boot-btn#upload-trigger {
		grid-column: span 1;
	}
}
'@ | Set-Content -Path "public\emulator.css" -Encoding UTF8 -NoNewline
Write-Host "   ok"

# ---------------------------------------------------------------- emulator.js
# This is the version that was actually built and boot-tested against the real
# v86 engine in a headless browser before shipping — including catching and
# fixing two real bugs: v86's save_state()/restore_state() are Promise-based
# (not callback-based), and localStorage's ~5-10MB quota is far too small for
# a VM snapshot, so state saving now goes through IndexedDB instead.
Say "Writing public\emulator.js..."
@'
// emulator.js — wires up the v86 emulator page.
// Presets boot from copy.sh's public demo images (small, free, always up).
// Uploaded files never leave the browser — v86 reads them locally via the File API.

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
		setStatus("Starting…");

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

	// ---- state storage (IndexedDB — localStorage's ~5-10MB quota is far too
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
		setStatus("Saving state…");
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
		setStatus("Loading state…");
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
		setStatus("Starting…");
	});
})();
'@ | Set-Content -Path "public\emulator.js" -Encoding UTF8 -NoNewline
Write-Host "   ok"

# ---------------------------------------------------------------- patch index.html
Say "Adding the Emulator button + changelog entry to index.html..."
$idx = Get-Content "public\index.html" -Raw

if ($idx -notmatch 'emulator\.html') {
    $idx = $idx -replace '(<link rel="stylesheet" href="index\.css" />)', "`$1`n`t`t<link rel=`"stylesheet`" href=`"emulator.css`" />"
    $idx = $idx -replace '(<body>\s*\r?\n)', "`$1`t`t<a href=`"emulator.html`" class=`"emulator-link`">Emulator</a>`n"
    Write-Host "   button + stylesheet link added"
} else {
    Write-Host "   button already present, skipping"
}

if ($idx -match '<ul class="about-list">\s*\r?\n\s*<li><span class="about-date">Aug 26') {
    if ($idx -notmatch "in-browser Emulator") {
        $idx = $idx -replace '(<h3>What.s new</h3>\s*\r?\n\s*<ul class="about-list">\s*\r?\n)', "`$1`t`t`t`t`t<li><span class=`"about-date`">Aug 26</span>Added an in-browser Emulator (top right) &mdash; boots TinyCore Linux or FreeDOS instantly, or upload your own disk image. Runs entirely on your device.</li>`n"
        Write-Host "   changelog entry added"
    } else {
        Write-Host "   changelog entry already present, skipping"
    }
} else {
    Write-Host "   (no matching about-list found to patch changelog into — skipped, not fatal)"
}

Set-Content -Path "public\index.html" -Value $idx -Encoding UTF8 -NoNewline

# ---------------------------------------------------------------- commit
Say "Committing to dev..."
git add public\v86 public\emulator.html public\emulator.css public\emulator.js public\index.html
git commit -m "add v86 in-browser emulator, linked from a top-right button" | Out-Null
Write-Host "   done"

# ---------------------------------------------------------------- deploy
Say "Pushing dev, merging to main, deploying..."
git push origin dev
git checkout main
git merge dev --no-edit
git pull origin main --no-edit
git push origin main
git checkout dev

Write-Host @"

=========================================================
DONE.

The Emulator button now appears top-right on the Cinder home page
and links to emulator.html. Give GitHub Pages ~1 minute, then
hard-refresh (Ctrl+Shift+R).

This version has been boot-tested end-to-end (not just written):
the engine, the picker UI, the upload flow, and Save/Load/Reset/
Stop were all verified working against the real v86 engine before
this script was finalized. Two real bugs were caught and fixed in
the process -- save/load state now correctly uses v86's Promise
API and stores snapshots in IndexedDB instead of localStorage
(localStorage's ~5-10MB cap was too small for a real VM snapshot
and would have failed silently every time).

What you get out of the box, no setup:
   - TinyCore Linux  -- boots in a few seconds, full desktop
   - FreeDOS         -- for old DOS games/software
   - Upload your own .iso/.img/.vhd -- stays entirely on your
     device, never touches any server. This is how you'd load a
     Windows disk image you already own -- pick "Hard Disk" as
     the type. A full install-from-ISO is possible too but will
     be slow; an existing installed image works best.

Performance is software CPU emulation in the browser -- old/light
stuff runs great, modern OSes will be sluggish. That's v86's real
ceiling, not a bug.

IF SOMETHING BREAKS, roll back instantly:
     git checkout main
     git reset --hard pre-emulator
     git push origin main --force
=========================================================

"@ -ForegroundColor Green
