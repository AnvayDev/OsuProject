// Ported from osu.Framework/Platform/GameHost.cs (update/draw loop and scene graph bootstrap only).
// One requestAnimationFrame callback runs UpdateFrame (update + masking) followed by the DOM "draw" (element validation).

import { DependencyContainer } from '../allocation/DependencyContainer';
import { Container } from '../graphics/containers/Container';
import { DomInputHandler } from '../input/handlers/DomInputHandler';
import { InputHandler, UserInputManager } from '../input/InputManager';
import type { Game } from '../Game';
import { Axes } from '../layout/Enums';
import { Vector2 } from '../layout/Vector2';
import { FramedClock } from '../timing/FramedClock';
import type { IFrameBasedClock } from '../timing/IClock';
import { StopwatchClock } from '../timing/StopwatchClock';

export class GameHost {
  /** The root of the scene graph. */
  root: Container | null = null;

  readonly dependencies = new DependencyContainer();

  /** The clock which is to be used by the scene graph (will be assigned to root). */
  readonly sceneGraphClock: IFrameBasedClock = new FramedClock(new StopwatchClock(true));

  private frameCount = 0;
  private rafHandle = 0;

  /** The DOM element the scene graph is mounted into (defaults to document.body). */
  constructor(private readonly mount: HTMLElement = document.body) {}

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
    root.child = new Container().with({ relativeSizeAxes: Axes.Both, child: game });

    this.dependencies.cache(root);
    this.dependencies.cacheAs(GameHost, this);

    game.setHost(this);

    root.loadDrawable(this.sceneGraphClock, this.dependencies);

    this.mount.appendChild(root.element);
    root.element.style.overflow = 'hidden';

    //publish bootstrapped scene graph to all threads.
    this.root = root;
  }

  run(game: Game): void {
    this.bootstrapSceneGraph(game);

    const loop = () => {
      this.updateFrame();
      this.rafHandle = requestAnimationFrame(loop);
    };

    this.rafHandle = requestAnimationFrame(loop);
  }

  /** Runs one frame: clock, update, masking, DOM. Exposed for tests and screenshot tooling. */
  updateFrame(): void {
    const root = this.root;
    if (root === null) return;

    this.frameCount++;

    this.sceneGraphClock.processFrame();

    root.size = Vector2.componentMax(Vector2.One, new Vector2(this.mount.clientWidth || window.innerWidth, this.mount.clientHeight || window.innerHeight));

    root.updateSubTree();
    root.updateSubTreeMasking();

    root.validateElementSubTree();
  }

  exit(): void {
    cancelAnimationFrame(this.rafHandle);
    this.domInput?.dispose();
    this.root?.dispose();
    this.root = null;
  }
}
