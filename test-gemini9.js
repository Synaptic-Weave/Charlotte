"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
if (content.modelTurn && content.modelTurn.parts) {
    for (var _i = 0, _a = content.modelTurn.parts; _i < _a.length; _i++) {
        var part = _a[_i];
        if (part.functionCall) {
            console.log(part.functionCall.name, part.functionCall.args, part.functionCall.id);
        }
    }
}
