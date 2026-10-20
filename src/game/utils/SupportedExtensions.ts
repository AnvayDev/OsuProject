// Ported from osu.Game/Utils/SupportedExtensions.cs

export const SupportedExtensions = {
  VIDEO_EXTENSIONS: ['.mp4', '.mov', '.avi', '.flv', '.mpg', '.wmv', '.m4v'],
  AUDIO_EXTENSIONS: ['.mp3', '.ogg', '.wav'],
  IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png'],

  get ALL_EXTENSIONS(): string[] {
    return [...this.VIDEO_EXTENSIONS, ...this.AUDIO_EXTENSIONS, ...this.IMAGE_EXTENSIONS];
  },
};
