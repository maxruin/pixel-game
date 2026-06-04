let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * 播放街機 8-bit 音效
 * @param {'click' | 'correct' | 'wrong' | 'victory' | 'gameover'} type 音效類型
 */
export const playSound = (type) => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (type === 'click') {
      // 清脆的短嗶聲 (頻率快速上揚)
      osc.type = 'square';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1000, now + 0.05);
      
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'correct') {
      // 答對叮咚聲 (雙音 E5 -> G5)
      osc.type = 'triangle';
      
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.08); // G5
      
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.setValueAtTime(0.12, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'wrong') {
      // 答錯低沈下降聲 (C3 -> A2 鋸齒波)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(130.81, now); // C3
      osc.frequency.linearRampToValueAtTime(80, now + 0.25);
      
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'victory') {
      // 經典勝利凱旋短曲 (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      const duration = 0.12;
      osc.type = 'square';
      
      notes.forEach((freq, index) => {
        const time = now + index * duration;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.06, time + duration - 0.02);
      });
      
      gain.gain.setValueAtTime(0.08, now + (notes.length - 1) * duration);
      gain.gain.exponentialRampToValueAtTime(0.001, now + notes.length * duration);
      
      osc.start(now);
      osc.stop(now + notes.length * duration);
    } else if (type === 'gameover') {
      // 悲壯失敗音樂 (G3 -> E3 -> C3)
      const notes = [196.00, 164.81, 130.81];
      const duration = 0.22;
      osc.type = 'sawtooth';
      
      notes.forEach((freq, index) => {
        const time = now + index * duration;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.12, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration - 0.02);
      });
      
      osc.start(now);
      osc.stop(now + notes.length * duration);
    }
  } catch (e) {
    console.warn("AudioContext is not supported or not interactive yet.", e);
  }
};
