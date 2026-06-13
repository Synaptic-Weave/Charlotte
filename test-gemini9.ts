import { LiveServerContent } from '@google/genai';
declare const content: LiveServerContent;
if (content.modelTurn && content.modelTurn.parts) {
  for (const part of content.modelTurn.parts) {
    if (part.functionCall) {
      console.log(part.functionCall.name, part.functionCall.args, part.functionCall.id);
    }
  }
}
