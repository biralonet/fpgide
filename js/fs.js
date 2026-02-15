export class FileSystem {
    constructor() {
        this.dirHandle = null;
        this.files = new Map(); // path -> fileHandle
    }

    async openDirectory() {
        try {
            this.dirHandle = await window.showDirectoryPicker();
            await this.refresh();
            return true;
        } catch (e) {
            console.error("Failed to open directory", e);
            return false;
        }
    }

    async refresh() {
        if (!this.dirHandle) return;
        this.files.clear();
        await this._scan(this.dirHandle, "");
    }

    async _scan(dirHandle, path) {
        for await (const entry of dirHandle.values()) {
            const entryPath = path ? `${path}/${entry.name}` : entry.name;
            if (entry.kind === 'file') {
                this.files.set(entryPath, entry);
            } else if (entry.kind === 'directory') {
                await this._scan(entry, entryPath);
            }
        }
    }

    getFileList() {
        return Array.from(this.files.keys()).sort();
    }

    async readFile(path) {
        const handle = this.files.get(path);
        if (!handle) throw new Error(`File not found: ${path}`);
        const file = await handle.getFile();
        return await file.text();
    }

    async writeFile(path, content) {
        const handle = this.files.get(path);
        if (!handle) {
            // Support creating new files in the root for now
            const newHandle = await this.dirHandle.getFileHandle(path, { create: true });
            this.files.set(path, newHandle);
            return await this.writeFile(path, content);
        }
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
    }

    async readAsArrayBuffer(path) {
        const handle = this.files.get(path);
        if (!handle) throw new Error(`File not found: ${path}`);
        const file = await handle.getFile();
        return await file.arrayBuffer();
    }

    async readAsUint8Array(path) {
        const buffer = await this.readAsArrayBuffer(path);
        return new Uint8Array(buffer);
    }
}
