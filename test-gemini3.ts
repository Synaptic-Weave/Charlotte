import { LiveSendRealtimeInputParameters } from '@google/genai';
const params: LiveSendRealtimeInputParameters[] = [{
  audio: {
    mimeType: 'audio/pcm;rate=16000',
    data: 'base64data'
  }
}];
