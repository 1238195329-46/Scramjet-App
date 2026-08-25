import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { cp } from "node:fs/promises";

await cp(scramjetPath, "public/scram", { recursive: true });
await cp(libcurlPath, "public/libcurl", { recursive: true });
await cp(baremuxPath, "public/baremux", { recursive: true });

console.log("Copied scramjet, libcurl, and baremux static assets into public/");
