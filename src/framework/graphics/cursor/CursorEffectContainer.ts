// Ported from osu.Framework/Graphics/Cursor/CursorEffectContainer.cs
// C#'s TSelf / TTarget type checks are the abstract isSelfType / isTarget.

import { Container } from '../containers/Container';
import type { CompositeDrawable } from '../containers/CompositeDrawable';
import type { Drawable } from '../Drawable';
import type { InputManager } from '../../input/InputManager';

/** An abstract container type that handles positional input for many drawables of type TTarget. */
export abstract class CursorEffectContainer<TTarget extends Drawable> extends Container {
  override get handlePositionalInput(): boolean {
    return true;
  }

  private inputManager: InputManager | null = null;

  protected override loadComplete(): void {
    super.loadComplete();
    this.inputManager = this.getContainingInputManager();
  }

  /** Whether the drawable is a TTarget. */
  protected abstract isTarget(d: Drawable): d is TTarget;

  /** Whether the drawable is a TSelf (a nested effect container of the same kind). */
  protected abstract isSelfType(d: CompositeDrawable | null): boolean;

  private readonly childDrawables = new Set<Drawable>();
  private readonly nestedContainerChildDrawables = new Set<Drawable | null>();
  private readonly newChildDrawables: Drawable[] = [];
  private readonly targetChildren: TTarget[] = [];

  private findTargetChildren(): void {
    // Skip all drawables in the hierarchy prior to (and including) ourself.
    const targetCandidates = this.inputManager!.positionalInputQueue;

    const selfIndex = targetCandidates.indexOf(this);

    if (selfIndex < 0) return;

    this.childDrawables.add(this);

    // keep track of all hovered drawables below this and nested effect containers
    // so we can decide which ones are valid candidates for receiving our effect and so
    // we know when we can abort our search.
    for (let i = selfIndex - 1; i >= 0; i--) {
      const candidate = targetCandidates[i];

      if (!this.isTarget(candidate))
        continue;

      if (!candidate.isHovered)
        continue;

      // Children of drawables we are responsible for transitively also fall into our subtree,
      // and therefore we need to handle them. If they are not children of any drawables we handle,
      // it means that we iterated beyond our subtree and may terminate.
      let parent: Drawable | null = candidate.parent;

      // We keep track of all drawables we found while traversing the parent chain upwards.
      this.newChildDrawables.length = 0;
      this.newChildDrawables.push(candidate);

      // When we encounter a drawable we already encountered before, then there is no need
      // to keep going upward, since we already recorded it previously. At that point we know
      // the drawables we found are in fact children of ours.
      while (parent === null || !this.childDrawables.has(parent)) {
        // If we reach to the root node (i.e. parent == null), then we found a drawable
        // which is no longer a child of ours and we may terminate.
        if (parent === null)
          return;

        this.newChildDrawables.push(parent);
        parent = parent.parent;
      }

      // Assuming we did _not_ end up terminating, then all found drawables are children of ours
      // and need to be added.
      for (const newChild of this.newChildDrawables)
        this.childDrawables.add(newChild);

      // Keep track of child drawables whose effects are managed by a nested effect container.
      // Note, that nested effect containers themselves could implement TTarget and
      // are still our own responsibility to handle.
      for (let j = this.newChildDrawables.length - 1; j >= 0; j--) {
        const d = this.newChildDrawables[j];

        if (d.parent === this || (!this.isSelfType(d.parent) && !this.nestedContainerChildDrawables.has(d.parent)))
          continue;

        this.nestedContainerChildDrawables.add(d);
      }

      // Ignore drawables whose effects are managed by a nested effect container.
      if (this.nestedContainerChildDrawables.has(candidate))
        continue;

      // We found a valid candidate; keep track of it
      this.targetChildren.push(candidate);
    }
  }

  /**
   * Returns currently hovered child drawables of type TTarget, in top-down order (see InputManager.positionalInputQueue).
   * Only drawables where handlePositionalInput is true are considered. When multiple TSelf are nested, only the closest parent
   * container receives the candidate.
   */
  protected findTargets(): readonly TTarget[] {
    this.findTargetChildren();

    // Clean up
    this.childDrawables.clear();
    this.nestedContainerChildDrawables.clear();
    this.newChildDrawables.length = 0;

    if (this.targetChildren.length === 0)
      return [];

    const result = [...this.targetChildren].reverse();

    this.targetChildren.length = 0;

    return result;
  }
}
