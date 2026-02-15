// Web Worker for FPGA Toolchain
import { runYosys } from "https://cdn.jsdelivr.net/npm/@yowasp/yosys@0.59.84-dev.1027/gen/bundle.js";
import { runNextpnrHimbaechelGowin, runGowinPack } from "https://cdn.jsdelivr.net/npm/@yowasp/nextpnr-himbaechel-gowin@0.10.38-dev.709/gen/bundle.js";

self.onmessage = async (e) => {
    const { type, files, topModule, device, family, cstFile, output } = e.data;

    try {
        // Ensure all file data is Uint8Array (required for WASM transfer)
        const normalizedFiles = {};
        for (const [name, data] of Object.entries(files)) {
            if (data instanceof Uint8Array) {
                normalizedFiles[name] = data;
            } else if (data instanceof ArrayBuffer) {
                normalizedFiles[name] = new Uint8Array(data);
            } else if (typeof data === "string") {
                normalizedFiles[name] = new TextEncoder().encode(data);
            } else {
                // Handle potential Proxy/Object from structured clone
                normalizedFiles[name] = new Uint8Array(Object.values(data));
            }
        }

        if (type === "synthesis") {
            const result = await runSynthesis(normalizedFiles, topModule);
            self.postMessage({ type: "success", step: "synthesis", result });
        } else if (type === "pnr") {
            const result = await runPnR(normalizedFiles, topModule, device, family, cstFile);
            self.postMessage({ type: "success", step: "pnr", result });
        } else if (type === "pack") {
            const result = await runPack(normalizedFiles, topModule, family, output);
            self.postMessage({ type: "success", step: "pack", result });
        }
    } catch (err) {
        console.error("Worker Error:", err);
        self.postMessage({ type: "error", message: err.message });
    }
};

async function runSynthesis(files, topModule) {
    const vFiles = Object.keys(files).filter(f => f.endsWith(".v"));
    
    const includedFiles = new Set();
    for (const f of vFiles) {
        const content = new TextDecoder().decode(files[f]);
        const matches = content.matchAll(/^\s*`include\s+"([^"]+)"/gm);
        for (const match of matches) includedFiles.add(match[1]);
    }

    const filesToRead = vFiles.filter(f => !includedFiles.has(f));
    const readCmd = filesToRead.map(f => `read_verilog ${f}`).join("; ");
    const args = ["-p", `${readCmd}; synth_gowin -top ${topModule} -json ${topModule}.json`];

    return await runYosys(args, files, {
        printLine: (line) => self.postMessage({ type: "log", message: `[Yosys] ${line}` })
    });
}

async function runPnR(files, topModule, device, family, cstFile) {
    const args = [
        "--json", `${topModule}.json`,
        "--write", `${topModule}_pnr.json`,
        "--device", device,
        "--vopt", `family=${family}`
    ];

    if (files[cstFile]) {
        args.push("--vopt", `cst=${cstFile}`);
    } else {
        const anyCst = Object.keys(files).find(f => f.endsWith(".cst"));
        if (anyCst) args.push("--vopt", `cst=${anyCst}`);
    }

    return await runNextpnrHimbaechelGowin(args, files, {
        printLine: (line) => self.postMessage({ type: "log", message: `[nextpnr] ${line}` })
    });
}

async function runPack(files, topModule, family, output) {
    self.postMessage({ type: "log", message: "[gowin_pack] Initializing Python VM..." });
    
    const { loadPyodide } = await import("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.mjs");
    const pyodide = await loadPyodide();
    
    pyodide.setStdout({ write: (buffer) => {
        const line = new TextDecoder().decode(buffer).trim();
        if (line) self.postMessage({ type: "log", message: `[gowin_pack] ${line}` });
        return buffer.length;
    }});

    pyodide.FS.mkdir("/root");
    for (const [name, data] of Object.entries(files)) {
        pyodide.FS.writeFile(`/root/${name}`, data);
    }
    pyodide.FS.chdir("/root");

    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    await micropip.install("apycula");

    const packArgs = ["-d", family, "-o", output, `${topModule}_pnr.json`];
    
    pyodide.runPython(`
import sys
sys.argv = ["gowin_pack"] + ${JSON.stringify(packArgs)}
from apycula.gowin_pack import main
try:
    main()
    error = None
except SystemExit as e:
    error = f"Exit {e.code}" if e.code != 0 else None
except Exception as e:
    import traceback
    error = traceback.format_exc()
`);

    const error = pyodide.globals.get("error");
    if (error) throw new Error(error);

    const bitstream = pyodide.FS.readFile(`/root/${output}`);
    const result = {};
    result[output] = bitstream;
    return result;
}
