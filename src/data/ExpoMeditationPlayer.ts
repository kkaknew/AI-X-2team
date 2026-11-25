import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';

import type { MeditationPlayer } from './MeditationPlayer';

/**
 * 데이터 계층: MeditationPlayer를 expo-audio로 구현한다. (#11 [9] 명상 인증)
 *
 * - 곡: assets/meditation.mp3 (정해진 클래식 음악 1곡). 곡을 바꾸려면 이 파일만 바꾸면 된다.
 * - 무음 모드에서도 소리가 나게 한다. 명상은 소리를 들어야 하므로.
 * - 백그라운드 재생은 켜지 않는다. 명상 중 앱을 벗어나면 어차피 인증되지 않는다.
 * - 앱을 켤 때 곡을 미리 불러 둔다. 개발 중(Expo Go)에는 곡(약 7MB)을 컴퓨터에서 받아 오느라
 *   [시작]을 누른 뒤에 불러오면 오래 걸려서, 미리 받아 두고 [시작]에서 바로 재생한다.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MUSIC: number = require('../assets/meditation.mp3');

/** 곡을 불러오는 데 이보다 오래 걸리면 실패로 본다 (ms). 개발 중 느린 네트워크(핫스팟)도 견디게 넉넉히 */
const LOAD_TIMEOUT_MS = 60_000;

export class ExpoMeditationPlayer implements MeditationPlayer {
  /** assets/CREDITS.md와 같은 내용 */
  readonly credit = '음악: Gymnopédie No. 1 (Erik Satie) · 연주 Kevin MacLeod (incompetech.com) · CC BY 3.0';
  private player: AudioPlayer | null = null;
  /** 미리 불러 두는 플레이어. play()가 가져다 쓰고, 다 쓰면 다음 번을 위해 다시 만든다 */
  private next: AudioPlayer | null = null;

  constructor() {
    this.preload();
  }

  private preload(): void {
    if (this.next) return;
    try {
      this.next = createAudioPlayer(MUSIC);
    } catch (e) {
      // 미리 못 불러와도 play()에서 다시 만든다
      console.warn('[ExpoMeditationPlayer] 명상 음악을 미리 불러오지 못했습니다', e);
      this.next = null;
    }
  }

  async play(onEnd: () => void): Promise<{ durationSec: number }> {
    await this.stop();
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });

    const player = this.next ?? createAudioPlayer(MUSIC);
    this.next = null;
    this.player = player;

    try {
      const durationSec = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          sub.remove();
          reject(new Error('명상 음악을 불러오지 못했어요'));
        }, LOAD_TIMEOUT_MS);
        const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
          if (status.isLoaded && status.duration > 0) {
            clearTimeout(timer);
            sub.remove();
            resolve(status.duration);
          }
        });
        // 이미 불러온 상태면 이벤트가 오지 않을 수 있다
        if (player.isLoaded && player.duration > 0) {
          clearTimeout(timer);
          sub.remove();
          resolve(player.duration);
        }
      });

      let ended = false;
      player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (!status.didJustFinish || ended || this.player !== player) return;
        ended = true;
        this.release(player);
        onEnd();
      });
      player.play();
      return { durationSec };
    } catch (error) {
      this.release(player);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.player) this.release(this.player);
  }

  private release(player: AudioPlayer): void {
    if (this.player === player) this.player = null;
    try {
      player.pause();
    } catch {
      // 이미 정리된 플레이어면 무시
    }
    player.remove();
    // 다음 명상을 위해 다시 미리 불러 둔다
    this.preload();
  }
}
