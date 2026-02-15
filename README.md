# fpgide

A simple web-based IDE for FPGA development on the Gowin Tang Nano 20K.

## Features
- **Zero-Build**: Runs directly in the browser using ESM and CDNs.
- **Local File System**: Syncs with your local folders using the File System Access API.
- **Full Toolchain**: Synthesis with Yosys, PnR with nextpnr-gowin, and bitstream generation with gowin_pack—all via WebAssembly (YoWASP).
- **WebUSB Flashing**: Program your Tang Nano 20K directly from the browser using openFPGALoader.

## Usage
1. Open `index.html` in a modern browser (Chrome/Edge/Opera recommended for File System Access and WebUSB).
2. Click **Open Folder** and select your FPGA project directory.
3. Edit your Verilog (`.v`) and constraints (`.cst`) files.
4. Click **Build** to generate the bitstream.
5. Click **Flash** to program the board via WebUSB.

## Notes
- **WebUSB**: You must click the "Flash" button yourself to trigger the USB permission dialog (user gesture requirement).
- **Tang Nano 20K**: The default target is `GW2AR-LV18QN88C8/I7`.
- **Top Module**: The build process assumes your top-level module is named `top` and located in `top.v`.

## Implementation Details
- **Editor**: CodeMirror 6.
- **Toolchain**: YoWASP (WebAssembly builds of Yosys, nextpnr, etc.).
- **Programmer**: YoWASP build of openFPGALoader with WebUSB transport.
