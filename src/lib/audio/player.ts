/** 简单的 Web Audio 播放器：整段或选区播放，支持停止 */
let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function stopPlayback(): void {
  if (current) {
    try {
      current.stop();
    } catch {
      /* 已停止 */
    }
    current.disconnect();
    current = null;
  }
}

/** 播放 buffer 的 [startSec, endSec]（缺省整段）。返回播放时长（秒）。 */
export async function playBuffer(
  buffer: AudioBuffer,
  startSec = 0,
  endSec?: number,
): Promise<number> {
  const ac = getAudioContext();
  if (ac.state === 'suspended') await ac.resume();
  stopPlayback();
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.connect(ac.destination);
  const offset = Math.max(0, Math.min(startSec, buffer.duration));
  const dur = Math.max(0.01, (endSec ?? buffer.duration) - offset);
  src.start(0, offset, Math.min(dur, buffer.duration - offset));
  current = src;
  src.onended = () => {
    if (current === src) current = null;
  };
  return dur;
}
