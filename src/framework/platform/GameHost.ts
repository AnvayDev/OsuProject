// Ported from osu.Framework/Platform/GameHost.cs (update/draw loop and scene graph bootstrap only).
// One requestAnimationFrame callback runs UpdateFrame (update + masking) followed by the DOM "draw" (element validation).

import { DependencyContainer } from '../allocation/DependencyContainer';
import { BindableBool } from '../bindables/Bindable';
import { Container } from '../graphics/containers/Container';
import { InputKey, KeyBinding } from '../input/bindings/KeyBindings';
import { DomInputHandler } from '../input/handlers/DomInputHandler';
import { InputHandler, UserInputManager } from '../input/InputManager';
import { PlatformAction } from '../input/PlatformAction';
import { PlatformActionContainer } from '../input/PlatformActionContainer';
import { Game } from '../Game';
import { Axes } from '../layout/Enums';
import { Vector2 } from '../layout/Vector2';
import { Platform, RuntimeInfo } from '../RuntimeInfo';
import { macOSKeyBindings } from './MacOSGameHost';
import { FramedClock } from '../timing/FramedClock';
import type { IFrameBasedClock } from '../timing/IClock';
import { StopwatchClock } from '../timing/StopwatchClock';
import { AudioThread } from './AudioThread';

export class GameHost {
  /** The root of the scene graph. */
  root: Container | null = null;

  readonly dependencies = new DependencyContainer();

  /** The clock which is to be used by the scene graph (will be assigned to root). */
  readonly sceneGraphClock: IFrameBasedClock = new FramedClock(new StopwatchClock(true));

  /** Updates the registered AudioManagers once per frame (osu!framework runs them on a dedicated thread). */
  readonly audioThread = new AudioThread();

  private frameCount = 0;
  private rafHandle = 0;

  /** The DOM element the scene graph is mounted into (defaults to document.body). */
  constructor(private readonly mount: HTMLElement = document.body) {}

  /** Whether the game window is active (focused): the browser window has focus and the page is visible. */
  readonly isActive = new BindableBool(true);

  private readonly updateIsActive = (): void => {
    this.isActive.value = document.visibilityState === 'visible' && document.hasFocus();
  };

  /** Whether the host can exit (desktop hosts can; the web port keeps the desktop behaviour). */
  get canExit(): boolean {
    return true;
  }

  /** The input handlers available to the root UserInputManager. */
  readonly availableInputHandlers: InputHandler[] = [];

  private domInput: DomInputHandler | null = null;

  /** Creates the root above the game (Game.CreateUserInputManager). */
  protected createRoot(_game: Game): Container {
    this.domInput = new DomInputHandler(this.mount);
    this.availableInputHandlers.push(this.domInput);

    return new UserInputManager(() => this.availableInputHandlers, () => this.domInput?.cursorInWindow ?? true);
  }

  private bootstrapSceneGraph(game: Game): void {
    const root = this.createRoot(game);
    root.child = new PlatformActionContainer().with({
      // (FrameworkActionContainer, which only drives debug overlays, is not ported.) The plain container stands in for SafeAreaDefiningContainer.
      child: new Container().with({ relativeSizeAxes: Axes.Both, child: game }),
    });

    this.dependencies.cache(root);
    this.dependencies.cacheAs(Game, game);
    this.dependencies.cacheAs(GameHost, this);

    game.setHost(this);

    root.loadDrawable(this.sceneGraphClock, this.dependencies);

    this.mount.appendChild(root.element);
    root.element.style.overflow = 'hidden';

    window.addEventListener('focus', this.updateIsActive);
    window.addEventListener('blur', this.updateIsActive);
    document.addEventListener('visibilitychange', this.updateIsActive);
    this.updateIsActive();

    //publish bootstrapped scene graph to all threads.
    this.root = root;
  }

  run(game: Game): void {
    this.bootstrapSceneGraph(game);

    const loop = () => {
      this.updateFrame();

      if (!this.exitRequested)
        this.rafHandle = requestAnimationFrame(loop);
    };

    this.rafHandle = requestAnimationFrame(loop);
  }

  /** Runs one frame: clock, update, masking, DOM. Exposed for tests and screenshot tooling. */
  updateFrame(): void {
    const root = this.root;
    if (root === null) return;

    this.frameCount++;
    this.inFrame = true;

    try {
      this.audioThread.onNewFrame();

      this.sceneGraphClock.processFrame();

      root.size = Vector2.componentMax(Vector2.One, new Vector2(this.mount.clientWidth || window.innerWidth, this.mount.clientHeight || window.innerHeight));

      root.updateSubTree();
      root.updateSubTreeMasking();

      root.validateElementSubTree();
    } finally {
      this.inFrame = false;
    }

    if (this.exitRequested)
      this.performExit();
  }

  /** GameHost.PlatformKeyBindings, with the overrides of MacOSGameHost/IOSGameHost and WindowsGameHost selected by RuntimeInfo.OS. */
  get platformKeyBindings(): KeyBinding[] {
    switch (RuntimeInfo.OS) {
      case Platform.macOS:
      case Platform.iOS:
        return macOSKeyBindings();

      case Platform.Windows:
        return [...defaultPlatformKeyBindings(), new KeyBinding([InputKey.Alt, InputKey.F4], PlatformAction.Exit)];

      default:
        return defaultPlatformKeyBindings();
    }
  }

  /** Opens a URL in a new browser tab (GameHost.OpenUrlExternally). */
  openUrlExternally(url: string): void {
    window.open(url, '_blank', 'noopener');
  }

  private inFrame = false;
  private exitRequested = false;

  exit(): void {
    this.exitRequested = true;

    // An exit requested during a frame (e.g. by a screen exiting) takes effect once that frame has completed.
    if (!this.inFrame)
      this.performExit();
  }

  protected performExit(): void {
    cancelAnimationFrame(this.rafHandle);
    window.removeEventListener('focus', this.updateIsActive);
    window.removeEventListener('blur', this.updateIsActive);
    document.removeEventListener('visibilitychange', this.updateIsActive);
    this.domInput?.dispose();
    this.root?.dispose();
    this.root = null;
  }
}

const defaultPlatformKeyBindings = (): KeyBinding[] => [
  new KeyBinding([InputKey.Control, InputKey.X], PlatformAction.Cut),
  new KeyBinding([InputKey.Control, InputKey.C], PlatformAction.Copy),
  new KeyBinding([InputKey.Control, InputKey.V], PlatformAction.Paste),
  new KeyBinding([InputKey.Shift, InputKey.Delete], PlatformAction.Cut),
  new KeyBinding([InputKey.Control, InputKey.Insert], PlatformAction.Copy),
  new KeyBinding([InputKey.Shift, InputKey.Insert], PlatformAction.Paste),
  new KeyBinding([InputKey.Control, InputKey.A], PlatformAction.SelectAll),
  new KeyBinding(InputKey.Left, PlatformAction.MoveBackwardChar),
  new KeyBinding(InputKey.Right, PlatformAction.MoveForwardChar),
  new KeyBinding(InputKey.BackSpace, PlatformAction.DeleteBackwardChar),
  new KeyBinding(InputKey.Delete, PlatformAction.DeleteForwardChar),
  new KeyBinding([InputKey.Shift, InputKey.Left], PlatformAction.SelectBackwardChar),
  new KeyBinding([InputKey.Shift, InputKey.Right], PlatformAction.SelectForwardChar),
  new KeyBinding([InputKey.Shift, InputKey.BackSpace], PlatformAction.DeleteBackwardChar),
  new KeyBinding([InputKey.Control, InputKey.Left], PlatformAction.MoveBackwardWord),
  new KeyBinding([InputKey.Control, InputKey.Right], PlatformAction.MoveForwardWord),
  new KeyBinding([InputKey.Control, InputKey.BackSpace], PlatformAction.DeleteBackwardWord),
  new KeyBinding([InputKey.Control, InputKey.Delete], PlatformAction.DeleteForwardWord),
  new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.Left], PlatformAction.SelectBackwardWord),
  new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.Right], PlatformAction.SelectForwardWord),
  new KeyBinding(InputKey.Home, PlatformAction.MoveBackwardLine),
  new KeyBinding(InputKey.End, PlatformAction.MoveForwardLine),
  new KeyBinding([InputKey.Shift, InputKey.Home], PlatformAction.SelectBackwardLine),
  new KeyBinding([InputKey.Shift, InputKey.End], PlatformAction.SelectForwardLine),
  new KeyBinding([InputKey.Control, InputKey.PageUp], PlatformAction.DocumentPrevious),
  new KeyBinding([InputKey.Control, InputKey.PageDown], PlatformAction.DocumentNext),
  new KeyBinding([InputKey.Control, InputKey.Tab], PlatformAction.DocumentNext),
  new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.Tab], PlatformAction.DocumentPrevious),
  new KeyBinding([InputKey.Control, InputKey.W], PlatformAction.DocumentClose),
  new KeyBinding([InputKey.Control, InputKey.F4], PlatformAction.DocumentClose),
  new KeyBinding([InputKey.Control, InputKey.N], PlatformAction.DocumentNew),
  new KeyBinding([InputKey.Control, InputKey.T], PlatformAction.TabNew),
  new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.T], PlatformAction.TabRestore),
  new KeyBinding([InputKey.Control, InputKey.S], PlatformAction.Save),
  new KeyBinding(InputKey.Home, PlatformAction.MoveToListStart),
  new KeyBinding(InputKey.End, PlatformAction.MoveToListEnd),
  new KeyBinding([InputKey.Control, InputKey.Z], PlatformAction.Undo),
  new KeyBinding([InputKey.Control, InputKey.Y], PlatformAction.Redo),
  new KeyBinding([InputKey.Control, InputKey.Shift, InputKey.Z], PlatformAction.Redo),
  new KeyBinding(InputKey.Delete, PlatformAction.Delete),
  new KeyBinding([InputKey.Control, InputKey.Plus], PlatformAction.ZoomIn),
  new KeyBinding([InputKey.Control, InputKey.KeypadPlus], PlatformAction.ZoomIn),
  new KeyBinding([InputKey.Control, InputKey.Minus], PlatformAction.ZoomOut),
  new KeyBinding([InputKey.Control, InputKey.KeypadMinus], PlatformAction.ZoomOut),
  new KeyBinding([InputKey.Control, InputKey.Number0], PlatformAction.ZoomDefault),
  new KeyBinding([InputKey.Control, InputKey.Keypad0], PlatformAction.ZoomDefault),
];
