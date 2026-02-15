import { runOpenFPGALoader } from "@yowasp/openfpgaloader";

export class Programmer {
    constructor(ui) {
        this.ui = ui;
    }

    async flash(bitstreamData, board = "tangnano20k") {
        this.ui.log(`Requesting USB device for flashing ${board}...`);
        
        try {
            // Check if WebUSB is supported
            if (!navigator.usb) {
                throw new Error("WebUSB is not supported in this browser. Please use Chrome, Edge, or Opera.");
            }

            const files = {
                "bitstream.fs": bitstreamData
            };

            // Tang Nano 20K specific args
            const args = ["-b", board, "bitstream.fs"];
            
            this.ui.log("Opening USB selection dialog. Please select your board and click 'Connect'...");
            
            const decoder = new TextDecoder();
            await runOpenFPGALoader(args, files, {
                stdout: (line) => {
                    if (!line) return;
                    const text = typeof line === 'string' ? line : decoder.decode(line);
                    this.ui.log(`[openFPGALoader] ${text.trim()}`);
                },
                stderr: (line) => {
                    if (!line) return;
                    const text = typeof line === 'string' ? line : decoder.decode(line);
                    const msg = text.trim();
                    if (msg) this.ui.log(`[openFPGALoader] ${msg}`, msg.includes("Error") ? "error" : "info");
                }
            });
            
            this.ui.success("Flashing complete!");
        } catch (e) {
            console.error("Flash error:", e);
            
            if (e.message && e.message.includes("Must be handling a user gesture")) {
                this.ui.error("USB access must be triggered by a button click. Try clicking 'Flash' again.");
            } else if (e.message && (e.message.includes("device not found") || e.message.includes("-3"))) {
                this.ui.error("Device not found. 1) Did you select the device in the browser popup? 2) Is another program (like a serial terminal or Gowin IDE) using the board? If so, close it.");
            } else if (e.name === "NotFoundError" || (e.message && e.message.includes("no device selected"))) {
                this.ui.warn("Flash cancelled: No USB device was selected.");
            } else if (e.name === "SecurityError" || (e.message && e.message.includes("Access denied"))) {
                this.ui.error("Access denied. The device might be locked by the OS or another application.");
            } else {
                this.ui.error(`Flashing failed: ${e.message}`);
            }
            throw e;
        }
    }

    async detect() {
        this.ui.log("Scanning for USB devices...");
        try {
            const decoder = new TextDecoder();
            await runOpenFPGALoader(["--detect"], {}, {
                stdout: (line) => {
                    if (!line) return;
                    const text = typeof line === 'string' ? line : decoder.decode(line);
                    this.ui.log(`[openFPGALoader] ${text.trim()}`);
                },
                stderr: (line) => {
                    if (!line) return;
                    const text = typeof line === 'string' ? line : decoder.decode(line);
                    this.ui.log(`[openFPGALoader] ${text.trim()}`);
                }
            });
        } catch (e) {
            this.ui.error(`Detection failed: ${e.message}`);
        }
    }
}
