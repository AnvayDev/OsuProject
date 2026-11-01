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
  const box = (type: string, ...children: Uint8Array[]) => {
    const size = 8 + children.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(size);
    new DataView(out.buffer).setUint32(0, size);
    out.set(new TextEncoder().encode(type), 4);
    let offset = 8;
    for (const c of children) { out.set(c, offset); offset += c.length; }
    return out;
  };
  // a track's sample description: version/flags, entry count 1, then the first sample entry (its size and codec type)
  const track = (entry: string) => {
    const stsd = new Uint8Array(16);
    new DataView(stsd.buffer).setUint32(4, 1);
    new DataView(stsd.buffer).setUint32(8, 8);
    stsd.set(new TextEncoder().encode(entry), 12);
    return box('trak', box('mdia', box('minf', box('stbl', box('stsd', stsd)))));
  };
  const file = (...entries: string[]) => {
    const ftyp = box('ftyp', new TextEncoder().encode('isom'));
    // (media data that happens to contain the bytes of a sample description must not count)
    const mdat = box('mdat', new TextEncoder().encode('stsd\0\0\0\0\0\0\0\x01\0\0\0\x08avc1'));
    return box('', ftyp, mdat, box('moov', ...entries.map(track))).subarray(8);
  };

  it('plays H.264, VP9 and AV1 tracks directly, whatever track comes first', () => {
    expect(isNativelyPlayableMp4(file('avc1'))).toBe(true);
    expect(isNativelyPlayableMp4(file('mp4a', 'vp09'))).toBe(true);
    expect(isNativelyPlayableMp4(file('av01', 'mp4a'))).toBe(true);
  });

  it('converts MPEG-4 Part 2 and files without a recognisable track', () => {
    expect(isNativelyPlayableMp4(file('mp4a', 'mp4v'))).toBe(false);
    expect(isNativelyPlayableMp4(file())).toBe(false);
    expect(isNativelyPlayableMp4(new Uint8Array(64))).toBe(false);
  });
});
