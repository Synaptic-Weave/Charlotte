import { LiveClient } from '@google/genai';
declare const client: LiveClient;
client.sendRealtimeInput([{
  audio: {
    data: 'abc',
    mimeType: 'audio/pcm;rate=16000'
  }
}]);
