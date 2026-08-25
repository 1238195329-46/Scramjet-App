"use strict";
/**
 * @type {HTMLFormElement}
 */
const form = document.getElementById("sj-form");
/**
 * @type {HTMLInputElement}
 */
const address = document.getElementById("sj-address");
/**
 * @type {HTMLInputElement}
 */
const searchEngine = document.getElementById("sj-search-engine");
/**
 * @type {HTMLParagraphElement}
 */
const error = document.getElementById("sj-error");
/**
 * @type {HTMLPreElement}
 */
const errorCode = document.getElementById("sj-error-code");

const { ScramjetController } = $scramjetLoadController();

const scramjet = new ScramjetController({
	prefix: new URL("scramjet/", location.href).pathname,
	files: {
		wasm: "scram/scramjet.wasm.wasm",
		all: "scram/scramjet.all.js",
		sync: "scram/scramjet.sync.js",
	},
});

scramjet.init();

const connection = new BareMux.BareMuxConnection(new URL("baremux/worker.js", location.href).href);

form.addEventListener("submit", async (event) => {
	event.preventDefault();

	try {
		await registerSW();
		if (!navigator.serviceWorker.controller) {
			location.reload();
			return;
		}
	} catch (err) {
		error.textContent = "Failed to register service worker.";
		errorCode.textContent = err.toString();
		throw err;
	}

	const url = search(address.value, searchEngine.value);

	let wispUrl = "wss://scramjet-app-plhs.onrender.com/wisp/";
	if ((await connection.getTransport()) !== new URL("libcurl/index.mjs", location.href).href) {
		await connection.setTransport(new URL("libcurl/index.mjs", location.href).href, [
			{ websocket: wispUrl },
		]);
	}
	const frame = scramjet.createFrame();
	frame.frame.id = "sj-frame";
	document.body.appendChild(frame.frame);
	frame.go(url);
});


