const port = Number(process.env.CANVAS_PALETTE_CDP_PORT || 9237);
const titlePattern = /Obsidian Mini Palette Sandbox/;
const screenshotIndex = process.argv.indexOf("--screenshot");
const screenshotPath = screenshotIndex >= 0 ? process.argv[screenshotIndex + 1] : null;
const diagnoseIndex = process.argv.indexOf("--diagnose");
const diagnose = diagnoseIndex >= 0;
const expression = screenshotIndex >= 0 ? null : diagnose ? process.argv[diagnoseIndex + 1] : process.argv[2];

if (!expression && !screenshotPath) {
  console.error("Usage: node scripts/sandbox-cdp.cjs <expression> | --diagnose <expression> | --screenshot <path>");
  process.exit(2);
}

async function main() {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const candidates = targets.filter((target) => target.type === "page" && titlePattern.test(target.title || ""));
  if (candidates.length !== 1) throw new Error(`Expected one Sandbox page target, found ${candidates.length}`);

  const socket = new WebSocket(candidates[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", (event) => reject(event.error || new Error("CDP WebSocket connection failed")), { once: true });
  });

  let sequence = 0;
  const pending = new Map();
  const diagnostics = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") diagnostics.push({ kind: "exception", text: message.params?.exceptionDetails?.text });
    if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params?.entry?.level)) diagnostics.push({ kind: message.params.entry.level, text: message.params.entry.text });
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") diagnostics.push({ kind: "console", text: message.params.args?.map((arg) => arg.value ?? arg.description).join(" ") });
    if (!message.id || !pending.has(message.id)) return;
    const promise = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) promise.reject(new Error(message.error.message));
    else promise.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  let output;
  if (screenshotPath) {
    const fs = require("fs");
    await send("Page.enable");
    const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(screenshotPath, Buffer.from(result.data, "base64"));
    output = screenshotPath;
  } else {
    await send("Runtime.enable");
    if (diagnose) await send("Log.enable");
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Sandbox evaluation failed");
    if (diagnose) await new Promise((resolve) => setTimeout(resolve, 500));
    output = diagnose ? { value: result.result?.value, diagnostics } : result.result?.value;
  }
  socket.close();
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
