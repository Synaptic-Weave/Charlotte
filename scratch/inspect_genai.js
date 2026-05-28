const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
dotenv.config();

const geminiApiKey = process.env.GEMINI_API_KEY || 'mock_key';
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

console.log('--- Inspecting ai.live ---');
console.log('ai.live keys:', Object.keys(ai.live || {}));
console.log('ai.live.connect:', ai.live.connect ? ai.live.connect.toString() : 'undefined');

// Let's see if we can inspect the prototype or class definition of what connect returns
// Since connect returns a promise of a session, we can see what methods are in the class if we can find it,
// or we can mock/stub connect or just see its source in index.cjs.
