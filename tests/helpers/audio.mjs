// Entirely synthetic PCM16 fixture. Never a recording from a toy.
export function syntheticWav({
  sampleRate = 16000,
  seconds = 0.25,
  channels = 1,
  frequency = 1000,
  amplitude = 0.5,
} = {}) {
  const frames = Math.floor(sampleRate * seconds);
  const buffer = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(buffer);
  const tag = (at, text) => [...text].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  tag(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, frames * channels * 2, true);
  for (let i = 0; i < frames; i++)
    for (let ch = 0; ch < channels; ch++)
      view.setInt16(
        44 + (i * channels + ch) * 2,
        Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * amplitude * 32767),
        true,
      );
  return buffer;
}
