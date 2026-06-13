import { LiveClient } from '@google/genai';
type MessageParams = Parameters<Parameters<LiveClient['on']>[1]>[0];
