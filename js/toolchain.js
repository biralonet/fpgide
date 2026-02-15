import { runYosys } from "@yowasp/yosys";
import { runNextpnrHimbaechelGowin } from "@yowasp/nextpnr-himbaechel-gowin";

export class Toolchain {
    constructor(ui) {
        this.ui = ui;
    }

    async runSynthesis(files, topModule) {
        this.ui.log(`[Yosys] Preparing synthesis for top module: ${topModule}...`);
        const vFiles = Object.keys(files).filter(f => f.endsWith(".v"));
        
        const includedFiles = new Set();
        for (const f of vFiles) {
            const data = files[f];
            const content = new TextDecoder().decode(data);
            const matches = content.matchAll(/^\s*`include\s+"([^"]+)"/gm);
            for (const match of matches) {
                includedFiles.add(match[1]);
            }
        }

        const filesToRead = vFiles.filter(f => !includedFiles.has(f));
        const readCmd = filesToRead.map(f => `read_verilog ${f}`).join("; ");
        const args = ["-p", `${readCmd}; synth_gowin -top ${topModule} -json ${topModule}.json`];

        try {
            return await runYosys(args, files, {
                printLine: (line) => line && this.ui.log(`[Yosys] ${line}`)
            });
        } catch (e) {
            console.error("Yosys crash:", e);
            throw e;
        }
    }

    async runPnR(files, topModule, device, family, cstFile) {
        this.ui.log(`[nextpnr] Placing and routing for ${device}...`);
        const args = [
            "--json", `${topModule}.json`,
            "--write", `${topModule}_pnr.json`,
            "--device", device,
            "--vopt", `family=${family}`
        ];

        if (files[cstFile]) {
            this.ui.log(`[nextpnr] Using constraints: ${cstFile}`);
            args.push("--vopt", `cst=${cstFile}`);
        } else {
            const anyCst = Object.keys(files).find(f => f.endsWith(".cst"));
            if (anyCst) {
                this.ui.log(`[nextpnr] Using fallback constraints: ${anyCst}`);
                args.push("--vopt", `cst=${anyCst}`);
            }
        }

        try {
            return await runNextpnrHimbaechelGowin(args, files, {
                printLine: (line) => {
                    if (line) this.ui.log(`[nextpnr] ${line}`);
                }
            });
        } catch (e) {
            console.error("nextpnr crash:", e);
            throw e;
        }
    }

    async runPack(files, topModule, family, output) {
        this.ui.log(`[gowin_pack] Generating bitstream (Manual implementation)...`);
        
        try {
            const { loadPyodide } = await import("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.mjs");
            const pyodide = await loadPyodide();
            
            pyodide.setStdout({ write: (buffer) => {
                const line = new TextDecoder().decode(buffer).trim();
                if (line) this.ui.log(`[gowin_pack] ${line}`);
                return buffer.length;
            }});
            pyodide.setStderr({ write: (buffer) => {
                const line = new TextDecoder().decode(buffer).trim();
                if (line) this.ui.log(`[gowin_pack Error] ${line}`, "error");
                return buffer.length;
            }});

            // Create Virtual FS
            pyodide.FS.mkdir("/root");
            for (const [name, data] of Object.entries(files)) {
                let uint8Data;
                if (data instanceof Uint8Array) {
                    uint8Data = data;
                } else if (typeof data === "string") {
                    uint8Data = new TextEncoder().encode(data);
                } else {
                    uint8Data = new Uint8Array(data);
                }
                pyodide.FS.writeFile(`/root/${name}`, uint8Data);
            }
            pyodide.FS.chdir("/root");

            this.ui.log("[gowin_pack] Installing dependencies in Python VM...");
            await pyodide.loadPackage("micropip");
            const micropip = pyodide.pyimport("micropip");
            await micropip.install("apycula");

            this.ui.log("[gowin_pack] Running gowin_pack...");
            const packArgs = ["-d", family, "-o", output, `${topModule}_pnr.json`];
            
            // CRITICAL: sys.argv MUST be set BEFORE importing apycula
            // because some of its modules access sys.argv at the top level.
            pyodide.runPython(`
import sys
import os
sys.argv = ["gowin_pack"] + ${JSON.stringify(packArgs)}

from apycula.gowin_pack import main
try:
    main()
    error = None
except SystemExit as e:
    if e.code != 0:
        error = f"Exit code {e.code}"
    else:
        error = None
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

        } catch (e) {
            console.error("Manual gowin_pack crash:", e);
            this.ui.error(`Bitstream generation failed: ${e.message}`);
            throw e;
        }
    }
}
