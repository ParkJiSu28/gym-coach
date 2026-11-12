// 휴식 타이머 알림. iPhone(Safari)은 navigator.vibrate 를 지원하지 않으므로 소리(Web Audio)를 함께 쓴다.
// iOS 는 사용자 터치 안에서 AudioContext 를 한 번 깨워야(unlock) 이후 소리를 낼 수 있다.

type WakeLockSentinelLike = { release: () => Promise<void> };

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** 버튼 클릭 등 사용자 동작 안에서 호출 */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

/** 짧은 비프 3번 + 지원 기기면 진동 */
export function restDoneAlert(): void {
  const c = getCtx();
  if (c) {
    try {
      const t0 = c.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, t0 + i * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.3 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.3 + 0.2);
        osc.connect(gain).connect(c.destination);
        osc.start(t0 + i * 0.3);
        osc.stop(t0 + i * 0.3 + 0.22);
      }
    } catch {
      /* 오디오 실패는 무시 — 화면 표시로 대체 */
    }
  }
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* 진동 미지원 */
  }
}

/** 운동 중 화면 꺼짐 방지 (지원 브라우저만). 해제 함수를 반환 */
export async function keepScreenOn(): Promise<() => void> {
  const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
  if (!wl) return () => undefined;
  try {
    const sentinel = await wl.request('screen');
    return () => void sentinel.release().catch(() => undefined);
  } catch {
    return () => undefined;
  }
}
