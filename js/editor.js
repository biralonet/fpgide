import { 
    EditorView, 
    basicSetup, 
    keymap, 
    EditorState, 
    StreamLanguage, 
    indentWithTab 
} from "https://esm.sh/codemirror@6.0.1?deps=@codemirror/state@6.4.1";

const verilogKeywords = "always|and|assign|automatic|begin|buf|bufif0|bufif1|case|casex|casez|cell|config|deassign|default|defparam|design|disable|edge|else|end|endcase|endconfig|endfunction|endgenerate|endmodule|endprimitive|endspecify|endtable|endtask|event|for|force|forever|fork|function|generate|genvar|highz0|highz1|if|ifnone|incdir|include|initial|inout|input|instance|integer|join|large|liblist|library|localparam|macromodule|medium|module|nand|negedge|nmos|nor|noshowcancelled|not|notif0|notif1|or|output|parameter|pmos|posedge|primitive|pull0|pull1|pulldown|pullup|pulsestyle_onevent|pulsestyle_ondetect|rcmos|real|realtime|reg|release|repeat|rnmos|rpmos|rtran|rtranif0|rtranif1|scalared|showcancelled|signed|small|specify|specparam|strong0|strong1|supply0|supply1|table|task|time|tran|tranif0|tranif1|tri|tri0|tri1|triand|trior|trireg|unsigned|use|vectored|wait|wand|weak0|weak1|while|wire|wor|xnor|xor";

const verilogLanguage = StreamLanguage.define({
    token(stream) {
        if (stream.eatSpace()) return null;
        if (stream.match("//")) { stream.skipToEnd(); return "comment"; }
        if (stream.match("/*")) {
            while (!stream.match("*/") && !stream.atEnd()) stream.next();
            return "comment";
        }
        
        if (stream.match(new RegExp(`\\b(${verilogKeywords})\\b`))) return "keyword";
        if (stream.match(/"(?:[^"\\\\]|\\\\.)*"/)) return "string";
        if (stream.match(/\\d+/)) return "number";
        
        stream.next();
        return null;
    }
});

export class Editor {
    constructor(domElement, onDocChange) {
        this.onDocChange = onDocChange;
        this.ignoreChanges = false;
        try {
            this.view = new EditorView({
                state: EditorState.create({
                    extensions: [
                        basicSetup,
                        keymap.of([indentWithTab]),
                        verilogLanguage,
                        EditorView.updateListener.of((update) => {
                            if (update.docChanged && !this.ignoreChanges) {
                                this.onDocChange();
                            }
                        })
                    ]
                }),
                parent: domElement
            });
        } catch (e) {
            console.error("Editor initialization error details:", e);
            throw e;
        }
    }

    setContent(content) {
        this.ignoreChanges = true;
        this.view.dispatch({
            changes: { from: 0, to: this.view.state.doc.length, insert: content }
        });
        this.ignoreChanges = false;
    }

    getContent() {
        return this.view.state.doc.toString();
    }
}
