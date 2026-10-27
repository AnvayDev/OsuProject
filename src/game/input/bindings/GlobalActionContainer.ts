// Ported from osu.Game/Input/Bindings/GlobalActionContainer.cs
// The DatabasedKeyBindingContainer base (user overrides stored in realm) is not ported: the bindings are always the defaults.

import {
  InputKey, type IKeyBinding, type IKeyBindingHandler, KeyBinding, KeyBindingContainer, type KeyBindingPressEvent, type KeyBindingReleaseEvent,
  KeyCombinationMatchingMode, SimultaneousBindingMode,
} from '@fw/input/bindings/KeyBindings';
import type { IHandleGlobalKeyboardInput } from '@fw/input/IHandleGlobalKeyboardInput';
import type { OsuGameBase } from '../../OsuGameBase';
import { GlobalAction, GlobalActionCategory } from './GlobalAction';

export class GlobalActionContainer extends KeyBindingContainer<GlobalAction> implements IHandleGlobalKeyboardInput, IKeyBindingHandler<GlobalAction> {
  readonly handlesGlobalKeyboardInput = true;

  readonly keyBindingActionTypes = [GlobalAction];

  protected override get prioritised(): boolean {
    return true;
  }

  private readonly handler: IKeyBindingHandler<GlobalAction> | null = null;

  constructor(game: OsuGameBase | null) {
    super(GlobalAction, SimultaneousBindingMode.None, KeyCombinationMatchingMode.Modifiers);

    // (game is IKeyBindingHandler<GlobalAction> h)
    if ((game as Partial<IKeyBindingHandler<GlobalAction>> | null)?.keyBindingActionTypes?.includes(GlobalAction) === true)
      this.handler = game as unknown as IKeyBindingHandler<GlobalAction>;
  }

  /**
   * All default key bindings across all categories, ordered with highest priority first.
   *
   * IMPORTANT: Take care when changing order of the items in the enumerable.
   * It is used to decide the order of precedence, with the earlier items having higher precedence.
   */
  override get defaultKeyBindings(): readonly IKeyBinding[] {
    return [
      ...GlobalActionContainer.globalKeyBindings,
      ...GlobalActionContainer.editorKeyBindings,
      ...GlobalActionContainer.editorTestPlayKeyBindings,
      ...GlobalActionContainer.inGameKeyBindings,
      ...GlobalActionContainer.replayKeyBindings,
      ...GlobalActionContainer.songSelectKeyBindings,
      ...GlobalActionContainer.audioControlKeyBindings,
      // Overlay bindings may conflict with more local cases like the editor so they are checked last.
      // It has generally been agreed on that local screens like the editor should have priority,
      // based on such usages potentially requiring a lot more key bindings that may be "shared" with global ones.
      ...GlobalActionContainer.overlayKeyBindings,
    ];
  }

  static getDefaultBindingsFor(category: GlobalActionCategory): KeyBinding[] {
    switch (category) {
      case GlobalActionCategory.General:
        return GlobalActionContainer.globalKeyBindings;

      case GlobalActionCategory.Editor:
        return GlobalActionContainer.editorKeyBindings;

      case GlobalActionCategory.InGame:
        return GlobalActionContainer.inGameKeyBindings;

      case GlobalActionCategory.Replay:
        return GlobalActionContainer.replayKeyBindings;

      case GlobalActionCategory.SongSelect:
        return GlobalActionContainer.songSelectKeyBindings;

      case GlobalActionCategory.AudioControl:
        return GlobalActionContainer.audioControlKeyBindings;

      case GlobalActionCategory.Overlays:
        return GlobalActionContainer.overlayKeyBindings;

      case GlobalActionCategory.EditorTestPlay:
        return GlobalActionContainer.editorTestPlayKeyBindings;

      default:
        throw new RangeError(`Unexpected GlobalActionCategory ${category}`);
    }
  }

  static getGlobalActionsFor(category: GlobalActionCategory): GlobalAction[] {
    return [...new Set(GlobalActionContainer.getDefaultBindingsFor(category).map(binding => binding.action as GlobalAction))];
  }

  onPressed(e: KeyBindingPressEvent<GlobalAction>): boolean {
    return this.handler?.onPressed(e) === true;
  }

  onReleased(e: KeyBindingReleaseEvent<GlobalAction>): void {
    this.handler?.onReleased(e);
  }

  private static get globalKeyBindings(): KeyBinding[] {
    return [
      new KeyBinding(InputKey.Up, GlobalAction.SelectPrevious),
      new KeyBinding(InputKey.Down, GlobalAction.SelectNext),

      new KeyBinding(InputKey.Space, GlobalAction.Select),
      new KeyBinding(InputKey.Enter, GlobalAction.Select),
      new KeyBinding(InputKey.KeypadEnter, GlobalAction.Select),

      new KeyBinding(InputKey.Escape, GlobalAction.Back),
      new KeyBinding(InputKey.ExtraMouseButton1, GlobalAction.Back),

      new KeyBinding([InputKey.Alt, InputKey.Home], GlobalAction.Home),

      new KeyBinding(InputKey.None, GlobalAction.ToggleFPSDisplay),
      new KeyBinding([InputKey.Control, InputKey.T], GlobalAction.ToggleToolbar),
      new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.S], GlobalAction.ToggleSkinEditor),

      new KeyBinding([InputKey.Control, InputKey.Alt, InputKey.R], GlobalAction.ResetInputSettings),

      new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.R], GlobalAction.RandomSkin),
      new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.E], GlobalAction.PreviousSkin),
      new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.T], GlobalAction.NextSkin),

      new KeyBinding(InputKey.F10, GlobalAction.ToggleGameplayMouseButtons),
      new KeyBinding(InputKey.F12, GlobalAction.TakeScreenshot),
    ];
  }

  private static get overlayKeyBindings(): KeyBinding[] {
    return [
      new KeyBinding(InputKey.F8, GlobalAction.ToggleChat),
      new KeyBinding(InputKey.F6, GlobalAction.ToggleNowPlaying),
      new KeyBinding(InputKey.F9, GlobalAction.ToggleSocial),
      new KeyBinding([InputKey.Control, InputKey.B], GlobalAction.ToggleBeatmapListing),
      new KeyBinding([InputKey.Control, InputKey.O], GlobalAction.ToggleSettings),
      new KeyBinding([InputKey.Control, InputKey.N], GlobalAction.ToggleNotifications),
      new KeyBinding([InputKey.Control, InputKey.P], GlobalAction.ToggleProfile),
    ];
  }

  private static get editorKeyBindings(): KeyBinding[] {
    return [
      new KeyBinding([InputKey.F1], GlobalAction.EditorComposeMode),
      new KeyBinding([InputKey.F2], GlobalAction.EditorDesignMode),
      new KeyBinding([InputKey.F3], GlobalAction.EditorTimingMode),
      new KeyBinding([InputKey.F4], GlobalAction.EditorSetupMode),
      new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.A], GlobalAction.EditorVerifyMode),
      new KeyBinding([InputKey.Number1], GlobalAction.EditorSelectTool),
      new KeyBinding([InputKey.Q], GlobalAction.EditorToggleNewCombo),
      new KeyBinding([InputKey.W], GlobalAction.EditorToggleWhistleSound),
      new KeyBinding([InputKey.E], GlobalAction.EditorToggleFinishSound),
      new KeyBinding([InputKey.R], GlobalAction.EditorToggleClapSound),
      new KeyBinding([InputKey.Shift, InputKey.Q], GlobalAction.EditorToggleNormalAutoBank),
      new KeyBinding([InputKey.Shift, InputKey.W], GlobalAction.EditorToggleNormalNormalBank),
      new KeyBinding([InputKey.Shift, InputKey.E], GlobalAction.EditorToggleNormalSoftBank),
      new KeyBinding([InputKey.Shift, InputKey.R], GlobalAction.EditorToggleNormalDrumBank),
      new KeyBinding([InputKey.Alt, InputKey.Q], GlobalAction.EditorToggleAdditionAutoBank),
      new KeyBinding([InputKey.Alt, InputKey.W], GlobalAction.EditorToggleAdditionNormalBank),
      new KeyBinding([InputKey.Alt, InputKey.E], GlobalAction.EditorToggleAdditionSoftBank),
      new KeyBinding([InputKey.Alt, InputKey.R], GlobalAction.EditorToggleAdditionDrumBank),
      new KeyBinding([InputKey.Control, InputKey.D], GlobalAction.EditorCloneSelection),
      new KeyBinding([InputKey.J], GlobalAction.EditorNudgeLeft),
      new KeyBinding([InputKey.K], GlobalAction.EditorNudgeRight),
      new KeyBinding([InputKey.G], GlobalAction.EditorCycleGridSpacing),
      new KeyBinding([InputKey.Shift, InputKey.G], GlobalAction.EditorCycleGridType),
      new KeyBinding([InputKey.F5], GlobalAction.EditorTestGameplay),
      new KeyBinding([InputKey.T], GlobalAction.EditorTapForBPM),
      new KeyBinding([InputKey.Control, InputKey.H], GlobalAction.EditorFlipHorizontally),
      new KeyBinding([InputKey.Control, InputKey.J], GlobalAction.EditorFlipVertically),
      new KeyBinding([InputKey.Control, InputKey.Alt, InputKey.MouseWheelDown], GlobalAction.EditorDecreaseDistanceSpacing),
      new KeyBinding([InputKey.Control, InputKey.Alt, InputKey.MouseWheelUp], GlobalAction.EditorIncreaseDistanceSpacing),
      new KeyBinding([InputKey.Control, InputKey.MouseWheelDown], GlobalAction.EditorCyclePreviousBeatSnapDivisor),
      new KeyBinding([InputKey.Control, InputKey.MouseWheelUp], GlobalAction.EditorCycleNextBeatSnapDivisor),
      new KeyBinding(InputKey.None, GlobalAction.EditorToggleMoveControl),
      new KeyBinding([InputKey.Control, InputKey.R], GlobalAction.EditorToggleRotateControl),
      new KeyBinding([InputKey.Control, InputKey.E], GlobalAction.EditorToggleScaleControl),

      new KeyBinding([InputKey.Left], GlobalAction.EditorSeekBackwards),
      new KeyBinding([InputKey.Right], GlobalAction.EditorSeekForwards),

      // These two keys are reversed from stable because it feels more natural (and matches mouse wheel scroll directionality).
      new KeyBinding([InputKey.Up], GlobalAction.EditorSeekToPreviousTimingPoint),
      new KeyBinding([InputKey.Down], GlobalAction.EditorSeekToNextTimingPoint),

      new KeyBinding([InputKey.Control, InputKey.Left], GlobalAction.EditorSeekToPreviousHitObject),
      new KeyBinding([InputKey.Control, InputKey.Right], GlobalAction.EditorSeekToNextHitObject),
      new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.Left], GlobalAction.EditorSeekToPreviousSamplePoint),
      new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.Right], GlobalAction.EditorSeekToNextSamplePoint),

      new KeyBinding([InputKey.Z], GlobalAction.EditorSeekToStart),
      new KeyBinding([InputKey.X], GlobalAction.EditorPlayFromStart),
      new KeyBinding([InputKey.Space], GlobalAction.EditorTogglePause),
      new KeyBinding([InputKey.C], GlobalAction.EditorTogglePause),
      new KeyBinding([InputKey.V], GlobalAction.EditorSeekToEnd),

      new KeyBinding([InputKey.Control, InputKey.B], GlobalAction.EditorAddBookmark),
      new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.B], GlobalAction.EditorRemoveClosestBookmark),
      new KeyBinding([InputKey.Alt, InputKey.Left], GlobalAction.EditorSeekToPreviousBookmark),
      new KeyBinding([InputKey.Alt, InputKey.Right], GlobalAction.EditorSeekToNextBookmark),
      new KeyBinding([InputKey.Control, InputKey.L], GlobalAction.EditorDiscardUnsavedChanges),
      new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.U], GlobalAction.EditorSubmitBeatmap),
      new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.O], GlobalAction.EditorEditExternally),
    ];
  }

  private static get editorTestPlayKeyBindings(): KeyBinding[] {
    return [
      new KeyBinding([InputKey.Tab], GlobalAction.EditorTestPlayToggleAutoplay),
      new KeyBinding([InputKey.Control, InputKey.P], GlobalAction.EditorTestPlayToggleQuickPause),
      new KeyBinding([InputKey.F1], GlobalAction.EditorTestPlayQuickExitToInitialTime),
      new KeyBinding([InputKey.F2], GlobalAction.EditorTestPlayQuickExitToCurrentTime),
    ];
  }

  private static get inGameKeyBindings(): KeyBinding[] {
    return [
      new KeyBinding(InputKey.Space, GlobalAction.SkipCutscene),
      new KeyBinding(InputKey.ExtraMouseButton2, GlobalAction.SkipCutscene),
      new KeyBinding(InputKey.Tilde, GlobalAction.QuickRetry),
      new KeyBinding([InputKey.Control, InputKey.R], GlobalAction.QuickRetry),
      new KeyBinding([InputKey.Control, InputKey.Tilde], GlobalAction.QuickExit),
      new KeyBinding([InputKey.F3], GlobalAction.DecreaseScrollSpeed),
      new KeyBinding([InputKey.F4], GlobalAction.IncreaseScrollSpeed),
      new KeyBinding([InputKey.Shift, InputKey.Tab], GlobalAction.ToggleInGameInterface),
      new KeyBinding(InputKey.Tab, GlobalAction.ToggleInGameLeaderboard),
      new KeyBinding(InputKey.MouseMiddle, GlobalAction.PauseGameplay),
      new KeyBinding(InputKey.Control, GlobalAction.HoldForHUD),
      new KeyBinding(InputKey.Enter, GlobalAction.ToggleChatFocus),
      new KeyBinding(InputKey.F1, GlobalAction.SaveReplay),
      new KeyBinding(InputKey.F2, GlobalAction.ExportReplay),
      new KeyBinding(InputKey.Plus, GlobalAction.IncreaseOffset),
      new KeyBinding(InputKey.Minus, GlobalAction.DecreaseOffset),
    ];
  }

  private static get replayKeyBindings(): KeyBinding[] {
    return [
      new KeyBinding(InputKey.Space, GlobalAction.TogglePauseReplay),
      new KeyBinding(InputKey.MouseMiddle, GlobalAction.TogglePauseReplay),
      new KeyBinding(InputKey.Shift, GlobalAction.FastForwardReplay),
      new KeyBinding(InputKey.Left, GlobalAction.SeekReplayBackward),
      new KeyBinding(InputKey.Right, GlobalAction.SeekReplayForward),
      new KeyBinding(InputKey.Comma, GlobalAction.StepReplayBackward),
      new KeyBinding(InputKey.Period, GlobalAction.StepReplayForward),
      new KeyBinding([InputKey.Control, InputKey.H], GlobalAction.ToggleReplaySettings),
    ];
  }

  private static get songSelectKeyBindings(): KeyBinding[] {
    return [
      new KeyBinding(InputKey.Left, GlobalAction.ActivatePreviousSet),
      new KeyBinding(InputKey.Right, GlobalAction.ActivateNextSet),

      new KeyBinding([InputKey.Shift, InputKey.Left], GlobalAction.ExpandPreviousGroup),
      new KeyBinding([InputKey.Shift, InputKey.Right], GlobalAction.ExpandNextGroup),

      new KeyBinding([InputKey.Shift, InputKey.Enter], GlobalAction.ToggleCurrentGroup),

      new KeyBinding(InputKey.F1, GlobalAction.ToggleModSelection),
      new KeyBinding(InputKey.F2, GlobalAction.SelectNextRandom),
      new KeyBinding([InputKey.Shift, InputKey.F2], GlobalAction.SelectPreviousRandom),
      new KeyBinding(InputKey.F3, GlobalAction.ToggleBeatmapOptions),
      new KeyBinding(InputKey.BackSpace, GlobalAction.DeselectAllMods),
      new KeyBinding([InputKey.Control, InputKey.Up], GlobalAction.IncreaseModSpeed),
      new KeyBinding([InputKey.Control, InputKey.Down], GlobalAction.DecreaseModSpeed),
      new KeyBinding(InputKey.None, GlobalAction.AbsoluteScrollSongList),
    ];
  }

  private static get audioControlKeyBindings(): KeyBinding[] {
    return [
      new KeyBinding([InputKey.Alt, InputKey.Up], GlobalAction.IncreaseVolume),
      new KeyBinding([InputKey.Alt, InputKey.Down], GlobalAction.DecreaseVolume),

      new KeyBinding([InputKey.Alt, InputKey.Left], GlobalAction.PreviousVolumeMeter),
      new KeyBinding([InputKey.Alt, InputKey.Right], GlobalAction.NextVolumeMeter),

      new KeyBinding([InputKey.Control, InputKey.F4], GlobalAction.ToggleMute),

      new KeyBinding(InputKey.TrackPrevious, GlobalAction.MusicPrev),
      new KeyBinding(InputKey.F1, GlobalAction.MusicPrev),
      new KeyBinding(InputKey.TrackNext, GlobalAction.MusicNext),
      new KeyBinding(InputKey.F5, GlobalAction.MusicNext),
      new KeyBinding(InputKey.PlayPause, GlobalAction.MusicPlay),
      new KeyBinding(InputKey.F3, GlobalAction.MusicPlay),
    ];
  }
}
