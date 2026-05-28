/**
 * High-Performance G.711 mu-law (PCMU) & Linear PCM Audio Transcoder and Resampler.
 * Uses precomputed lookup tables to achieve O(1) constant-time companding.
 * Supports:
 *   - 8kHz 8-bit mu-law <=> 8kHz 16-bit Linear PCM
 *   - 8kHz 16-bit Linear PCM => 16kHz 16-bit Linear PCM (linear interpolation upsampling)
 *   - 24kHz 16-bit Linear PCM => 8kHz 16-bit Linear PCM (averaging downsampling)
 */

const BIAS = 0x84;
const MAX_PCM = 32767;

// Precomputed lookup tables
const MU_LAW_TO_PCM_TABLE = new Int16Array(256);
const PCM_TO_MU_LAW_TABLE = new Uint8Array(65536);

/**
 * Helper to encode a single 16-bit signed PCM sample to a mu-law byte (uninverted).
 */
function runEncodeMuLaw(sample: number): number {
  const sign = (sample >> 8) & 0x80;
  if (sign !== 0) {
    sample = -sample;
  }
  if (sample > 32635) {
    sample = 32635;
  }
  sample += BIAS; // BIAS = 132 (0x84)

  let exponent = 7;
  for (let exp = 7, mask = 0x4000; exp >= 0; exp--, mask >>= 1) {
    if ((sample & mask) !== 0) {
      exponent = exp;
      break;
    }
  }

  const mantissa = (sample >> (exponent + 3)) & 0x0F;
  const ulawByte = ~(sign | (exponent << 4) | mantissa);

  return ulawByte & 0xFF;
}

/**
 * Helper to decode a single mu-law byte to a 16-bit signed PCM sample.
 */
function runDecodeMuLaw(ulawByte: number): number {
  ulawByte = ~ulawByte & 0xFF;
  const sign = ulawByte & 0x80;
  const exponent = (ulawByte >> 4) & 0x07;
  const mantissa = ulawByte & 0x0F;

  let sample = (mantissa << 3) + BIAS;
  sample <<= exponent;
  sample -= BIAS;

  return sign === 0 ? sample : -sample;
}

// Populate the lookup tables on module initialization
for (let i = 0; i < 256; i++) {
  MU_LAW_TO_PCM_TABLE[i] = runDecodeMuLaw(i);
}

for (let i = 0; i < 65536; i++) {
  // Map index [0..65535] back to signed 16-bit range [-32768..32767]
  const sample = i - 32768;
  PCM_TO_MU_LAW_TABLE[i] = runEncodeMuLaw(sample);
}

/**
 * Decodes G.711 mu-law buffer to 16-bit signed linear PCM array.
 * Performs fast O(1) array lookup for each sample.
 */
export function decodeMuLawBuffer(muLawBuffer: Buffer): Int16Array {
  const len = muLawBuffer.length;
  const pcm = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    pcm[i] = MU_LAW_TO_PCM_TABLE[muLawBuffer[i]];
  }
  return pcm;
}

/**
 * Encodes 16-bit signed linear PCM array to G.711 mu-law buffer.
 * Performs fast O(1) array lookup for each sample.
 */
export function encodeMuLawBuffer(pcmSamples: Int16Array): Buffer {
  const len = pcmSamples.length;
  const muLawBuffer = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    // Clamp sample to 16-bit signed int range just in case
    let sample = pcmSamples[i];
    if (sample < -32768) sample = -32768;
    if (sample > 32767) sample = 32767;

    // Shift to 0..65535 index space
    const index = sample + 32768;
    muLawBuffer[i] = PCM_TO_MU_LAW_TABLE[index];
  }
  return muLawBuffer;
}

/**
 * Linearly interpolates 8kHz 16-bit PCM samples up to 16kHz 16-bit PCM.
 * Fills in intermediate samples with the average of adjacent values.
 */
export function upsample8kHzTo16kHz(samples: Int16Array): Int16Array {
  const len = samples.length;
  if (len === 0) return new Int16Array(0);

  const upsampled = new Int16Array(len * 2);
  for (let i = 0; i < len - 1; i++) {
    const s0 = samples[i];
    const s1 = samples[i + 1];
    upsampled[i * 2] = s0;
    upsampled[i * 2 + 1] = Math.round((s0 + s1) / 2);
  }
  // Handle boundary for last sample
  upsampled[(len - 1) * 2] = samples[len - 1];
  upsampled[(len - 1) * 2 + 1] = samples[len - 1];

  return upsampled;
}

/**
 * Downsamples 24kHz 16-bit PCM samples to 8kHz 16-bit PCM.
 * Uses a simple 3-sample average filter to reduce aliasing.
 */
export function downsample24kHzTo8kHz(samples: Int16Array): Int16Array {
  const len = samples.length;
  const outLen = Math.floor(len / 3);
  const downsampled = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const sum = samples[i * 3] + samples[i * 3 + 1] + samples[i * 3 + 2];
    downsampled[i] = Math.round(sum / 3);
  }

  return downsampled;
}

/**
 * Converts incoming Twilio base64 G.711 mu-law audio chunk (8kHz)
 * directly into base64 16kHz 16-bit Linear PCM for Gemini Live input.
 */
export function transcodeTwilioToGemini(base64MuLaw: string): string {
  const muLawBuffer = Buffer.from(base64MuLaw, 'base64');
  const pcm8kHz = decodeMuLawBuffer(muLawBuffer);
  const pcm16kHz = upsample8kHzTo16kHz(pcm8kHz);
  
  // Convert Int16Array to Node.js Buffer (Little-Endian)
  const pcmBuffer = Buffer.alloc(pcm16kHz.length * 2);
  for (let i = 0; i < pcm16kHz.length; i++) {
    pcmBuffer.writeInt16LE(pcm16kHz[i], i * 2);
  }
  return pcmBuffer.toString('base64');
}

/**
 * Converts incoming Gemini Live base64 24kHz 16-bit Linear PCM audio chunk
 * directly into base64 G.711 mu-law audio for Twilio Stream output.
 */
export function transcodeGeminiToTwilio(base64Pcm24kHz: string): string {
  const pcmBuffer = Buffer.from(base64Pcm24kHz, 'base64');
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  const pcm24kHz = new Int16Array(sampleCount);
  
  for (let i = 0; i < sampleCount; i++) {
    pcm24kHz[i] = pcmBuffer.readInt16LE(i * 2);
  }

  const pcm8kHz = downsample24kHzTo8kHz(pcm24kHz);
  const muLawBuffer = encodeMuLawBuffer(pcm8kHz);
  return muLawBuffer.toString('base64');
}

export function downsample24kHzTo8kHzWithCarryover(
  newSamples: Int16Array,
  carryover: Int16Array
): { downsampled: Int16Array; carryover: Int16Array } {
  const totalLen = carryover.length + newSamples.length;
  const combined = new Int16Array(totalLen);
  combined.set(carryover);
  combined.set(newSamples, carryover.length);

  const outLen = Math.floor(totalLen / 3);
  const downsampled = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const sum = combined[i * 3] + combined[i * 3 + 1] + combined[i * 3 + 2];
    downsampled[i] = Math.round(sum / 3);
  }

  const leftoverCount = totalLen % 3;
  let nextCarryover = new Int16Array(leftoverCount);
  for (let i = 0; i < leftoverCount; i++) {
    nextCarryover[i] = combined[totalLen - leftoverCount + i];
  }

  return { downsampled, carryover: nextCarryover };
}
