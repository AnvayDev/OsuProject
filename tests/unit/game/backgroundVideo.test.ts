import { describe, expect, it } from 'vitest';
import { findVideo } from '@game/screens/backgrounds/BeatmapBackgroundVideo';

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
