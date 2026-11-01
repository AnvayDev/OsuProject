import { describe, expect, it } from 'vitest';
import { findVideo } from '@game/screens/backgrounds/BeatmapBackgroundVideo';
import { isNativelyPlayableMp4 } from '@game/screens/backgrounds/VideoTranscoder';

const osu = (events: string) => `osu file format v14\n\n[General]\nAudioFilename: audio.mp3\n\n[Events]\n${events}\n\n[TimingPoints]\n0,500,4,2,0,60,1,0\n`;

describe('findVideo (LegacyStoryboardDecoder video events)', () => {
  it('finds a Video event with its start offset and cleaned path', () => {
    expect(findVideo(osu('//Background and Video events\n0,0,"bg.jpg",0,0\nVideo,-120,"sub\\\\clip.MP4"'))).toEqual({ path: 'sub/clip.MP4', startTime: -120 });
  });

  it('accepts the numeric event type and CRLF line endings', () => {
    expect(findVideo(osu('1,500,"video.avi"').replaceAll('\n', '\r\n'))).toEqual({ path: 'video.avi', startTime: 500 });
  });

  it('ignores video events that point at images, and events outside [Events]', () => {
    expect(findVideo(osu('1,0,"background.jpg"'))).toBeNull();
    expect(findVideo('[General]\nVideo,0,"video.mp4"\n')).toBeNull();
  });
});

describe('isNativelyPlayableMp4 (which MP4/MOV videos need converting)', () => {
  // A minimal 'stsd' box per track: size, type, version/flags, entry count, then the first sample entry's size and type.
  const stsd = (entry: string) => {
    const box = new Uint8Array(24);
    const view = new DataView(box.buffer);
    view.setUint32(0, 24);
    box.set(new TextEncoder().encode('stsd'), 4);
    view.setUint32(12, 1);
    view.setUint32(16, 8);
    box.set(new TextEncoder().encode(entry), 20);
    return box;
  };
  const file = (...entries: string[]) => {
    const boxes = entries.map(stsd);
    const out = new Uint8Array(8 + boxes.reduce((n, b) => n + b.length, 0));
    let offset = 8;
    for (const b of boxes) { out.set(b, offset); offset += b.length; }
    return out;
  };

  it('plays H.264, VP9 and AV1 tracks directly, whatever track comes first', () => {
    expect(isNativelyPlayableMp4(file('avc1'))).toBe(true);
    expect(isNativelyPlayableMp4(file('mp4a', 'vp09'))).toBe(true);
    expect(isNativelyPlayableMp4(file('av01', 'mp4a'))).toBe(true);
  });

  it('converts MPEG-4 Part 2 and files without a recognisable track', () => {
    expect(isNativelyPlayableMp4(file('mp4a', 'mp4v'))).toBe(false);
    expect(isNativelyPlayableMp4(new Uint8Array(64))).toBe(false);
  });
});
