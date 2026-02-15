export class Toolchain {
    constructor(ui) {
        this.ui = ui;
        this.worker = null;
    }

    _ensureWorker() {
        if (!this.worker) {
            this.worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
        }
    }

    _runInWorker(data) {
        this._ensureWorker();
        return new Promise((resolve, reject) => {
            const handler = (e) => {
                if (e.data.type === "log") {
                    this.ui.log(e.data.message);
                } else if (e.data.type === "success") {
                    this.worker.removeEventListener("message", handler);
                    resolve(e.data.result);
                } else if (e.data.type === "error") {
                    this.worker.removeEventListener("message", handler);
                    reject(new Error(e.data.message));
                }
            };
            this.worker.addEventListener("message", handler);
            this.worker.postMessage(data);
        });
    }

    async runSynthesis(files, topModule) {
        return this._runInWorker({ type: "synthesis", files, topModule });
    }

    async runPnR(files, topModule, device, family, cstFile) {
        return this._runInWorker({ type: "pnr", files, topModule, device, family, cstFile });
    }

    async runPack(files, topModule, family, output) {
        return this._runInWorker({ type: "pack", files, topModule, family, output });
    }
}
