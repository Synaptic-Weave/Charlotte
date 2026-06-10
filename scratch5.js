const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const m = 'gemini-2.0-flash';
  try {
    const session = await ai.live.connect({ 
      model: m,
      config: {
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "aoede",
              }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: "Hello" }]
        }
      }
    });
    console.log(`Connected to ${m}`);
    session.receive().then((events) => {
        for (const ev of events) console.log(ev);
    }).catch(console.error);
    setTimeout(() => session.close(), 2000);
  } catch (err) {
    console.log(`Error:`, err);
  }
}
run();
