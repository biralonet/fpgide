export class UI {
    constructor() {
        this.logElement = document.getElementById("log");
        this.statusElement = document.getElementById("status");
    }

    log(message, type = "info") {
        console.log(`[${type}] ${message}`);
        const div = document.createElement("div");
        div.className = `log-${type}`;
        div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        this.logElement.appendChild(div);
        this.logElement.scrollTop = this.logElement.scrollHeight;
    }

    clearLog() {
        this.logElement.innerHTML = "";
    }

    setStatus(text) {
        this.statusElement.textContent = text;
    }

    error(message) {
        this.log(message, "error");
        this.setStatus("Error");
    }

    success(message) {
        this.log(message, "success");
    }

    warn(message) {
        this.log(message, "warn");
    }
}
