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
        wasm: new URL("scram/scramjet.wasm.wasm", location.href).pathname,
        all: new URL("scram/scramjet.all.js", location.href).pathname,
        sync: new URL("scram/scramjet.sync.js", location.href).pathname,
    },
});
scramjet.init();
const connection = new BareMux.BareMuxConnection(new URL("baremux/worker.js", location.href).href);

async function launch(url) {
    error.textContent = "";
    errorCode.textContent = "";
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
}

const pendingUrl = sessionStorage.getItem("sj-pending-url");
if (pendingUrl) {
    sessionStorage.removeItem("sj-pending-url");
    error.textContent = "Resuming after one-time setup...";
    launch(pendingUrl);
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = search(address.value, searchEngine.value);
    error.textContent = "Setting up proxy, please wait...";
    errorCode.textContent = "";
    try {
        await registerSW();
        if (!navigator.serviceWorker.controller) {
            sessionStorage.setItem("sj-pending-url", url);
            error.textContent = "First-time setup: reloading automatically...";
            location.reload();
            return;
        }
    } catch (err) {
        error.textContent = "Failed to register service worker.";
        errorCode.textContent = err.toString();
        throw err;
    }
    launch(url);
});
