import { GoogleGenAI } from '@google/genai';
import { Gemini } from '@google/adk';

console.log('GoogleGenAI:', typeof GoogleGenAI);
console.log('Gemini:', typeof Gemini);

const ai = new GoogleGenAI({ apiKey: 'mock_key' });
console.log('ai keys:', Object.keys(ai));
console.log('ai.models keys:', Object.keys(ai.models || {}));
console.log('ai.live keys:', Object.keys(ai.live || {}));

const gemini = new Gemini({ apiKey: 'mock_key' });
console.log('gemini keys:', Object.keys(gemini));
console.log('gemini.connect:', typeof gemini.connect);
