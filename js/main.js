import { FileSystem } from "./fs.js";
import { Editor } from "./editor.js";
import { UI } from "./ui.js";
import { Toolchain } from "./toolchain.js";
import { Programmer } from "./programmer.js";

class App {
    constructor() {
        this.ui = new UI();
        this.fs = new FileSystem();
        this.toolchain = new Toolchain(this.ui);
        this.programmer = new Programmer(this.ui);
        
        this.currentFilePath = null;
        this.isDirty = false;
        this.buildConfig = {
            top: "top",
            family: "GW2A-18C",
            device: "GW2AR-LV18QN88C8/I7",
            cst: "tangnano20k.cst",
            output: "hello.fs"
        };

        try {
            this.editor = new Editor(document.getElementById("editor"), () => {
                this.isDirty = true;
                document.getElementById("btn-save").disabled = false;
            });
        } catch (e) {
            console.error("Failed to initialize editor:", e);
            this.ui.error("Failed to initialize editor. Check console.");
        }

        this.initEventListeners();

        if (!window.crossOriginIsolated) {
            this.ui.warn("Browser is not cross-origin isolated. Flashing may fail with 'SharedArrayBuffer' error. Please refresh twice or use Chrome/Edge.");
        }
    }

    initEventListeners() {
        document.getElementById("btn-open-folder").addEventListener("click", () => this.openFolder());
        document.getElementById("btn-new-file").addEventListener("click", () => this.createNewFile());
        document.getElementById("btn-save").addEventListener("click", () => this.saveCurrentFile());
        document.getElementById("btn-build").addEventListener("click", () => this.build());
        document.getElementById("btn-connect").addEventListener("click", () => this.connectUSB());
        document.getElementById("btn-flash").addEventListener("click", () => this.flash());
        document.getElementById("btn-clear-log").addEventListener("click", () => this.ui.clearLog());
        
        // Handle Ctrl+S
        window.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                this.saveCurrentFile();
            }
        });
    }

    async openFolder() {
        console.log("Open Folder clicked");
        if (typeof window.showDirectoryPicker !== "function") {
            this.ui.error("File System Access API not supported in this browser. Try Chrome/Edge.");
            return;
        }
        if (await this.fs.openDirectory()) {
            this.ui.log("Folder opened successfully.");
            
            // Try to load config.json
            try {
                const configContent = await this.fs.readFile("config.json");
                const config = JSON.parse(configContent);
                this.buildConfig = { ...this.buildConfig, ...config };
                this.ui.log(`Loaded config.json: Top=${this.buildConfig.top}, Output=${this.buildConfig.output}`);
            } catch (e) {
                this.ui.log("No config.json found or parse error. Using default Tang Nano 20K settings.");
            }

            this.renderFileTree();
            document.getElementById("btn-new-file").disabled = false;
            document.getElementById("btn-build").disabled = false;
            document.getElementById("btn-flash").disabled = false;
        }
    }

    async createNewFile() {
        const fileName = prompt("Enter file name (e.g. top.v):");
        if (!fileName) return;

        try {
            await this.fs.writeFile(fileName, "");
            await this.fs.refresh();
            this.renderFileTree();
            await this.loadFile(fileName);
            this.ui.success(`Created ${fileName}`);
        } catch (e) {
            this.ui.error(`Failed to create file: ${e.message}`);
        }
    }

    renderFileTree() {
        const tree = document.getElementById("file-tree");
        tree.innerHTML = "";
        const files = this.fs.getFileList();
        
        files.forEach(path => {
            const div = document.createElement("div");
            div.className = "file-item";
            if (path === this.currentFilePath) div.classList.add("active");
            div.textContent = path;
            div.addEventListener("click", () => this.loadFile(path));
            tree.appendChild(div);
        });
    }

    async loadFile(path) {
        if (this.isDirty) {
            if (!confirm("You have unsaved changes. Discard them?")) return;
        }

        try {
            const content = await this.fs.readFile(path);
            this.editor.setContent(content);
            this.currentFilePath = path;
            this.isDirty = false;
            document.getElementById("btn-save").disabled = true;
            this.ui.setStatus(`Editing: ${path}`);
            this.renderFileTree();
        } catch (e) {
            this.ui.error(`Failed to load file: ${e.message}`);
        }
    }

    async saveCurrentFile() {
        if (!this.currentFilePath) return;
        try {
            const content = this.editor.getContent();
            await this.fs.writeFile(this.currentFilePath, content);
            this.isDirty = false;
            document.getElementById("btn-save").disabled = true;
            this.ui.success(`Saved ${this.currentFilePath}`);
        } catch (e) {
            this.ui.error(`Failed to save: ${e.message}`);
        }
    }

    async build() {
        this.ui.setStatus("Building...");
        this.ui.clearLog();
        this.ui.log(`Starting build for ${this.buildConfig.device}...`);
        
        try {
            const files = {};
            const allFilePaths = this.fs.getFileList();
            
            for (const path of allFilePaths) {
                // Only load relevant files into memory
                if (path.endsWith(".v") || path.endsWith(".cst") || path.endsWith(".py") || path === "config.json") {
                    const data = await this.fs.readAsUint8Array(path);
                    files[path] = data;
                }
            }

            // 1. Synthesis
            const synthOut = await this.toolchain.runSynthesis(files, this.buildConfig.top);
            Object.assign(files, synthOut);

            // 2. PnR
            const pnrOut = await this.toolchain.runPnR(files, this.buildConfig.top, this.buildConfig.device, this.buildConfig.family, this.buildConfig.cst);
            Object.assign(files, pnrOut);

            // 3. Pack
            const packOut = await this.toolchain.runPack(files, this.buildConfig.top, this.buildConfig.family, this.buildConfig.output);
            
            if (packOut[this.buildConfig.output]) {
                const bitstream = packOut[this.buildConfig.output];
                await this.fs.writeFile(this.buildConfig.output, bitstream);
                this.bitstreamData = bitstream;
                
                // Refresh and re-render
                await this.fs.refresh();
                this.renderFileTree();
                
                this.ui.success(`Build successful! Bitstream saved as ${this.buildConfig.output}`);
            }

            this.ui.setStatus("Build Succeeded");
        } catch (e) {
            console.error("Build error details:", e);
            this.ui.error(`Build failed: ${e.message}`);
            this.ui.setStatus("Build Failed");
        }
    }

    async connectUSB() {
        this.ui.log("Requesting USB device selection...");
        if (!navigator.usb) {
            this.ui.error("WebUSB not supported in this browser.");
            return;
        }
        try {
            const device = await navigator.usb.requestDevice({ filters: [] });
            this.ui.success(`Connected to: ${device.productName || 'Unknown Device'} (VID: ${device.vendorId.toString(16).padStart(4, '0')}, PID: ${device.productId.toString(16).padStart(4, '0')})`);
        } catch (e) {
            if (e.name === "NotFoundError") {
                this.ui.warn("No device selected.");
            } else {
                this.ui.error(`Connection Error: ${e.message}`);
            }
        }
    }

    async flash() {
        // Load bitstream BEFORE starting the status update/try block
        // to minimize the delay after the button click.
        let data = this.bitstreamData;
        if (!data) {
            try {
                data = await this.fs.readAsUint8Array(this.buildConfig.output);
            } catch (e) {
                this.ui.error(`No bitstream found (${this.buildConfig.output}). Please build first.`);
                return;
            }
        }

        this.ui.setStatus("Flashing...");
        this.ui.log(`Bitstream size: ${data.length} bytes`);
        try {
            await this.programmer.flash(data, this.buildConfig.board || "tangnano20k");
            this.ui.setStatus("Ready");
        } catch (e) {
            if (e.message && e.message.includes("SharedArrayBuffer")) {
                this.ui.error("SharedArrayBuffer error. This usually requires cross-origin isolation. Please refresh the page twice or try a hard refresh (Cmd+Shift+R).");
            } else {
                this.ui.setStatus("Flash Failed");
            }
        }
    }
}

// Start the app
window.addEventListener("DOMContentLoaded", () => {
    window.app = new App();
});
