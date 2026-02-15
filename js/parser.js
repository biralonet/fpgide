export class MakefileParser {
    constructor() {
        this.vars = {};
    }

    parse(content) {
        this.vars = {};
        const lines = content.split(/?
/);
        
        // Basic variable extraction: VAR = VALUE
        for (let line of lines) {
            // Remove comments
            line = line.split('#')[0].trim();
            if (!line) continue;

            const match = line.match(/^([a-zA-Z0-9_-]+)\s*[:?]?=\s*(.*)$/);
            if (match) {
                let name = match[1].trim();
                let value = match[2].trim();
                
                // Simple variable expansion $(VAR)
                value = value.replace(/\$\((.*?)\)/g, (m, varName) => {
                    return this.vars[varName] || m;
                });

                this.vars[name] = value;
            }
        }
        return this.vars;
    }

    get(name, defaultValue = null) {
        return this.vars[name] || defaultValue;
    }
}
