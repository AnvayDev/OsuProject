// Ported from osu.Framework/Configuration/FrameworkConfigManager.cs
// Only the settings read by ported code are set: the volumes, which AudioManager binds to (their 0.01 precision is what volume adjustments step
// by). Add the others alongside the code that first reads them.

import { IniConfigManager } from './IniConfigManager';

export class FrameworkConfigManager extends IniConfigManager<FrameworkSetting> {
  static readonly FILENAME = 'framework.ini';

  protected override get filename(): string | null {
    return FrameworkConfigManager.FILENAME;
  }

  constructor(storage: Storage) {
    super(storage, FrameworkSetting);
  }

  protected override initialiseDefaults(): void {
    this.setDefaultDouble(FrameworkSetting.VolumeUniversal, 1.0, 0.0, 1.0, 0.01);
    this.setDefaultDouble(FrameworkSetting.VolumeMusic, 1.0, 0.0, 1.0, 0.01);
    this.setDefaultDouble(FrameworkSetting.VolumeEffect, 1.0, 0.0, 1.0, 0.01);
  }
}

export enum FrameworkSetting {
  VolumeUniversal = 'VolumeUniversal',
  VolumeEffect = 'VolumeEffect',
  VolumeMusic = 'VolumeMusic',
}
