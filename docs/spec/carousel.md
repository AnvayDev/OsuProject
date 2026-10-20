# Spec: song select beatmap carousel (lazer "SelectV2" design)

Scope: `Graphics/Carousel/*` (generic virtualised carousel) and the beatmap specialisation in `Screens/Select/`
(`BeatmapCarousel`, filters, all `Panel*` drawables, `NoResultsPlaceholder`), plus the bits of `SongSelect.cs`
that drive the carousel. No gameplay.

**Citation convention**: every `path:line` is relative to `_reference/`, so `osu/osu.Game/Screens/Select/Panel.cs:30`
means `_reference/osu/osu.Game/Screens/Select/Panel.cs` line 30. `fw/` is short for `osu-framework/osu.Framework/`.
`res/` is short for `osu-resources/osu.Game.Resources/`.

**Units**: all sizes are osu! layout units (see `docs/spec/framework.md` for the ScalingContainer). Times are in ms.
Easing names are osu!framework `Easing` enum members.

---

## 0. Most important facts (read first)

1. **Panels are right-anchored, and the panel's content is pushed right by a state-dependent X offset.** Each panel is full carousel
   width (`Anchor/Origin = TopRight`, `RelativeSizeAxes = X`). An inner `TopLevelContent` (rounded, radius 10) moves on X:
   `x = PanelXOffset + 10 + (selected||expanded ? 0 : (isBeatmap ? 50 : 100)) + (keyboardSelected ? 0 : 25)`, over 400 ms `OutQuint`.
   It goes past the right screen edge, so only the left rounded corners are visible. (§4.4)
2. **The list curves like a wheel.** Every frame `panel.X = (3 − √(9 − d²)) · halfHeight`, where `d = |1 − screenY/halfHeight|` and
   `halfHeight` is half the full screen height (the bleed areas included). Panels near the top and bottom of the screen move right. (§3.6)
3. **Vertical motion is damped. It is not tweened.** Each panel's draw Y follows its layout Y with `DampContinuously(halfTime = 50 ms)`. Panels
   that newly appear start at the *current* draw Y of the panel above them, so difficulties seem to slide out from under the set header.
   Scroll-to-selection centres the keyboard selection on the screen with an exponential approach (`exp(−0.01·dt)`, time constant 100 ms). (§3.5, §3.7)
4. **The accent colour is the star-rating colour.** The colour comes from `StarRatingDisplay`'s *animated* displayed stars,
   so it sweeps through the spectrum whenever the star value changes: `min(1000, 100 + 80·|Δ|)` ms `OutQuint`. Pool reuse and first
   display count as a change. It drives the left strip, the tint gradient, the triangles, the glow, the star counter and the selection pulse. (§5.1, §8.1)
5. **Selected and expanded panels pulse on the beat.** The panel gets a hollow glow (accent α0.8, radius 2) and an additive gradient
   on its right 80%. The gradient flashes with the beat: α0.8 in 40 ms, then decays to 0.4 over one beat length. Difficulty panels flash every beat,
   set headers every 2 beats in 4/4, and group headers every 4. (§4.5)

---

## 1. Class map → TS modules

| C# | Role | Suggested TS |
|---|---|---|
| `Graphics/Carousel/Carousel.cs` (+`.ScrollContainer.cs`) | generic virtualised list, selection, keyboard traversal, Y layout, curvature, depth | `game/graphics/carousel/Carousel.ts`, `CarouselScrollContainer.ts` |
| `CarouselItem.cs` | per-item layout record (Y, height, visible, expanded, depthLayer) | `CarouselItem.ts` |
| `ICarouselPanel.cs`, `ICarouselFilter.cs` | interfaces | same |
| `Screens/Select/BeatmapCarousel.cs` | spacing, expansion, samples, random, pools, focus offset | `game/screens/select/BeatmapCarousel.ts` |
| `BeatmapCarouselFilterMatching/Sorting/Grouping.cs` | filter pipeline | 3 modules (pure functions; can run in a Worker) |
| `Panel.cs` | panel base: masking, layers, state animations | `Panel.ts` |
| `PanelBeatmap.cs`, `PanelBeatmapSet.cs`(+`.SpreadDisplay`), `PanelBeatmapStandalone.cs`(+`.SpreadDisplay`), `PanelGroup*.cs` | panel types | one file each |
| `PanelSetBackground.cs`, `PanelLocalRankDisplay.cs`, `PanelUpdateBeatmapButton.cs` | panel parts | one file each |
| `NoResultsPlaceholder.cs` | empty state | `NoResultsPlaceholder.ts` |

Model records (`osu/osu.Game/Screens/Select/BeatmapCarousel.cs:1182-1234`):
- `GroupDefinition { order: number; title: string }`. Equality is a **case-insensitive title** comparison (`:1203`). Subtypes:
  `StarDifficultyGroupDefinition(order,title,difficulty)`, `RankDisplayGroupDefinition(rank)` (order = −rank), `RankedStatusGroupDefinition(order,status)`.
- `GroupedBeatmapSet(group | null, beatmapSet)` and `GroupedBeatmap(group | null, beatmap)` are value-equality records (`:1227`, `:1234`).
  Carousel items hold these, not raw `BeatmapInfo`.

---

## 2. Data pipeline (filter → sort → group → layout)

### 2.1 Trigger and debounces

1. `FilterControl` builds a `FilterCriteria` and calls `SongSelect.criteriaChanged` (`osu/osu.Game/Screens/Select/FilterControl.cs:289-339`).
2. `SongSelect.criteriaChanged` debounces by **250 ms** (`filter_delay`). The delay is **0** for the first filter, or when the current global
   beatmap is not valid for the new criteria (`osu/osu.Game/Screens/Select/SongSelect.cs:882-898`).
   It then calls `carousel.Filter(criteria, showLoadingImmediately: !isSelectionValid)`.
3. `BeatmapCarousel.Filter` (`osu/osu.Game/Screens/Select/BeatmapCarousel.cs:788-811`):
   - `resetDisplay = grouping.BeatmapSetsGroupedTogether != ShouldGroupBeatmapsTogether(criteria)`. When "sets grouped" mode flips, every existing panel is expired. Panels are not reused.
   - Loading-dim debounce, scheduled once (`??=`): after **250 ms**, or 0 if `showLoadingImmediately`, it runs
     `Scroll.FadeColour(Gray(0.5) = #808080, 1000, OutQuint)` and then `loading.Show()`.
   - When the filter completes: cancel the debounce, then `Scroll.FadeColour(white, 500, OutQuint)` and `loading.Hide()`.
4. `Carousel.FilterAsync` → `performFilter` (`osu/osu.Game/Graphics/Carousel/Carousel.cs:211-223, 359-426`):
   - Cancels the previous in-flight filter. Waits `DebounceDelay` = **100 ms** (`BeatmapCarousel.cs:97`).
   - Copies `Items` (all `BeatmapInfo`s of all sets) to `CarouselItem`s and runs the filters in order: Matching → Sorting → Grouping (`BeatmapCarousel.cs:103-114`).
   - `updateYPositions(items, visibleHalfHeight)` (§3.2).
   - On the main thread: `carouselItems = items; displayedRange = null`. If panels were not reusable, expire them all. Then `HandleFilterCompleted()`,
     `refreshAfterSelection()`, and `ScrollToSelection(immediate: true)` **only if** `!Scroll.UserScrolling`. Finally `NewItemsPresented(items)`.
5. Item-list changes (imports or deletes) re-filter automatically in `Update` once no filter is running (`Carousel.cs:1005-1006`).

`LoadingLayer` (`osu/osu.Game/Graphics/UserInterface/LoadingLayer.cs`) is a `LoadingSpinner(withBox: true)` that covers the carousel and blocks positional input
except scroll. Its spinner size is `clamp(min(W,H)·0.25, 20, 80)` (`:87`). It shows a black α0.7 rounded box, a white `CircleNotch` that spins once per 3150 ms,
and TrianglesV2. PopIn runs `FadeTo(0.01, 50).Then().FadeIn(500, OutQuint)` and scales the contents to 1 over 500 ms `OutQuint`. PopOut scales to 0.6 over 500 ms and
fades out over 250 ms (`osu/osu.Game/Graphics/UserInterface/LoadingSpinner.cs:42, 174-196`). A full spinner spec belongs to a shared component.

```ts
// BeatmapCarousel.filter
filter(criteria: FilterCriteria, showLoadingImmediately = false) {
  const resetDisplay = this.grouping.beatmapSetsGroupedTogether !== shouldGroupBeatmapsTogether(criteria);
  this.criteria = criteria;
  this.loadingDebounce ??= this.scheduler.addDelayed(() => {
    if (this.loading.state === 'visible') return;
    this.scroll.fadeColour(gray(0.5), 1000, Easing.OutQuint);
    this.loading.show();
  }, showLoadingImmediately ? 0 : 250);
  this.filterAsync(resetDisplay).then(() => this.schedule(() => {
    this.loadingDebounce?.cancel(); this.loadingDebounce = null;
    this.scroll.fadeColour(WHITE, 500, Easing.OutQuint);
    this.loading.hide();
  }));
}
```

### 2.2 Matching (`osu/osu.Game/Screens/Select/BeatmapCarouselFilterMatching.cs`)

For each beatmap, in this order (`:37-158`):
- Skip if `beatmap.hidden`.
- Ruleset: `match = !criteria.ruleset || allowGameplayWithRuleset(beatmap, criteria.ruleset, criteria.allowConvertedBeatmaps)` (`:56`).
  `allowGameplayWithRuleset`: the beatmap's ruleset equals the target, **or** (conversion is allowed **and** the beatmap is osu! (id 0) **and** the target is not osu!)
  (`osu/osu.Game/Beatmaps/BeatmapInfoExtensions.cs:70-79`). So in osu! mode only osu! maps show. In taiko/catch/mania mode with
  **ShowConvertedBeatmaps** on (default **true**, `osu/osu.Game/Configuration/OsuConfigManager.cs:48`), osu! maps also show.
- If `criteria.selectedBeatmapSet` is set ("scoped" to one set), return `sameSet && rulesetMatch`. Every other criterion is ignored (`:58-62`).
- Search terms: **every** term must match the difficulty name **or** any of author username, artist, artistUnicode, title, titleUnicode, source, tags
  (`osu/osu.Game/Beatmaps/BeatmapInfoExtensions.cs:47-63`, `osu/osu.Game/Beatmaps/BeatmapMetadataInfoExtensions.cs:24-35`).
  If that fails and the query is a single integer, the query also matches `beatmap.onlineID` or `set.onlineID` (`:72-76`).
- Ranges (`:81-93`): stars (SR is floored to 2 dp first), AR, HP, CS, OD, length (ms), lastPlayed, dateRanked, dateSubmitted, BPM, divisor, status set.
- Text keyword filters (`:97-141`): creator, artist (romanised **or** unicode; both must pass when the filter excludes), title (same rule), diff, source, user tags.
- The user star range comes from the difficulty slider (`UserStarDifficulty`, inclusive both ends) (`:143`), then the collection filter, ruleset criteria, `HasOnlineID`, and `BeatmapSetId`.
- `BeatmapItemsCount` = the number of matched difficulties.

**FilterQueryParser basics** (`osu/osu.Game/Screens/Select/FilterQueryParser.cs`):
- Regex `\b(?<key>\w+)(?<op>(!?(:|=)|(>|<)(:|=)?))(?<value>(".*?"[!]?)|(\S*))`, case-insensitive (`:19-21`). Each recognised `key op value` is
  removed from the query. The remainder becomes `SearchText` (`:23-43`).
- Operators: `=` or `:` → Equal, `!=` or `!:` → NotEqual, `<`, `<=` or `<:`, `>`, `>=` or `>:` (`:141-170`).
- Keys (`:47-138`): `star|stars|sr` (tolerance 0, so inclusive), `ar`, `dr|hp`, `cs`, `od` (tolerance 0.05), `bpm` (tolerance 0.5), `length` (suffix ms/s/m/h, default s, `:172-176`),
  `lastplayed`, `ranked`, `created|submitted`, `played` (bool: 1/yes/0/no/true/false), `divisor`, `status` (enum with exact or prefix match, comma lists),
  `creator|author|mapper`, `artist`, `title`, `diff`, `source`, `tag`, plus ruleset-specific keys (for example mania `keys`).
- Numeric equality is the range `[v−tol, v+tol]`. NotEqual inverts the range. `>` sets `min = v+tol` (`:281-319`).
- Text filters: `"quoted"` → IsolatedPhrase (word-boundary regex). `"quoted"!` → FullPhrase (whole-string, case-insensitive). Otherwise a case-insensitive substring
  (`osu/osu.Game/Screens/Select/FilterCriteria.cs:195-267`).
- `SearchText` tokenising (`FilterCriteria.cs:66-111`): a `[...]` segment sets the DifficultyName filter. Quoted segments stay whole. Everything else splits on spaces.
  If there is exactly one term and it is an int, it becomes `SearchNumber`.

### 2.3 Sorting (`osu/osu.Game/Screens/Select/BeatmapCarouselFilterSorting.cs`)

`groupedSets = shouldGroupBeatmapsTogether(criteria)` (§2.4). This is a stable sort (LINQ `Order`).
- When sets are grouped: two difficulties in the **same set** compare by ruleset (by OnlineID; official rulesets first), then by `StarRating` ascending (`:134-142`).
  Difficulties in different sets compare with `compare(a, b, sort, aggregate: true)`.
- `compare` (`:53-132`):

| SortMode | Comparison |
|---|---|
| Artist | artist, then falls through to Title |
| Title (**default**, `OsuConfigManager.cs:53`) | title |
| Author | author username |
| Source | source |
| Difficulty | StarRating ascending |
| DateAdded | **descending** (newest first) |
| DateRanked, DateSubmitted | descending, nulls last |
| LastPlayed | descending. With aggregate: max lastPlayed of the set's non-hidden difficulties |
| BPM, Length | ascending. With aggregate: max over the set's non-hidden difficulties |

  Tie-breaks: Title, then DateAdded descending, then set GUID descending.
- String comparison is `OrdinalSortByCaseStringComparer`: ordinal ignore-case, then **negative** ordinal, so lowercase comes before uppercase
  (`osu/osu.Game/Utils/OrdinalSortByCaseStringComparer.cs:41-47`). In TS:
  `cmp = cmpOrdinal(upperInvariant(a), upperInvariant(b)) || -cmpOrdinal(a, b)`. Compare UTF-16 code units, not `localeCompare`.

### 2.4 Grouping (`osu/osu.Game/Screens/Select/BeatmapCarouselFilterGrouping.cs`)

`shouldGroupBeatmapsTogether(c)` returns **false** (standalone difficulty panels) when Sort==Difficulty, Group==Difficulty,
(Sort==LastPlayed && Group==LastPlayed), or Group==RankAchieved. Otherwise it returns **true** (`:154-167`).

Output item list (`:52-152`). For each group, in group order:
- If the group is not null, add a **group header** item: `drawHeight = PanelGroup.HEIGHT (54)`, `depthLayer = −2`.
- For each beatmap in the group: at a set boundary (`lastBeatmap.set.ID !== beatmap.set.ID`), start a set-items list. If sets are grouped, add a
  **set header** (`drawHeight 72`, `depthLayer −1`) and increment `group.nestedItemCount`. Then add the **beatmap** item
  (`drawHeight 45` when grouped, `72` when standalone, `depthLayer 0`). In standalone mode `nestedItemCount` counts beatmaps.
- Initial visibility (`:140`): `isVisible = isGroupHeader || (group == null && (isSetHeader || !setsGrouped))`.
  So with no grouping, set headers are visible and difficulties hidden. With grouping, only headers are visible until the group expands.
- Maps that are rebuilt: `itemMap: model → {item, index}`, `setMap: GroupedBeatmapSet → Set<CarouselItem>` (includes the header), `groupMap: GroupDefinition → Set<CarouselItem>`.

Group modes (`:169-251`). Default is **None** (`OsuConfigManager.cs:52`). Groups are ordered by `order`, then by title (`:268-271`).

| GroupMode | Groups (order, title) |
|---|---|
| None | one null group |
| Artist / Author / Title | first char: digit → (−∞,"0-9"); A–Z → (letter−'A', uppercase letter); else (+∞, "Other") (`:274-285`) |
| DateAdded / LastPlayed | <1 d "Today"(0), <2 "Yesterday"(1), <7 "Last week"(2), <30 "Last month"(3), <60/90/120/150 days "N months ago"(60..150), else "Over 5 months ago"(151). LastPlayed null → (+∞,"Never played") (`:287-311`) |
| DateRanked | (−year, "YYYY") or (0, "Unranked") |
| RankedStatus | Ranked/Approved 0, Qualified 1, WIP 2, Pending 3, Graveyard 4, Local 5, None 6, Loved 7 (`:321-353`) |
| BPM | <60 "Under 60 BPM"; 10-BPM buckets up to 300; "Over 300 BPM" (`:355-367`) |
| Difficulty | truncated int stars: 0 → "Below 1 star"; 1..14 → "N stars"; ≥15 → "Over 15 stars" (`:369-382`) |
| Length | ≤1,2,3,4,5 min, ≤10 min, "Over 10 minutes" (`:384-396`) |
| Source | (0, source) or (1, "Unsourced") |
| Collections | one group per collection, in name order. Leftovers go to (+∞, "Not in collection"). A beatmap can appear in several groups (`:406-459`) |
| MyMaps / Favourites / RankAchieved | online or score dependent. Offline port: MyMaps and Favourites produce no items. RankAchieved puts everything in "Unplayed" |
| Variant | ruleset variants (mania key count). Behaves like None otherwise |

---

## 3. Generic carousel mechanics (`osu/osu.Game/Graphics/Carousel/Carousel.cs`)

### 3.1 CarouselItem (`osu/osu.Game/Graphics/Carousel/CarouselItem.cs`)
`DEFAULT_HEIGHT = 45` (`:14`). Fields: `carouselYPosition: number` (double), `carouselInputLenienceAbove/Below`, `drawHeight`, `depthLayer`,
`isVisible = true`, `isExpanded`, `nestedItemCount`. Items compare by Y (`:74-79`) for binary search.

### 3.2 Y layout and spacing
```ts
// Carousel.updateItemYPosition (Carousel.cs:436-456)
function updateItemYPosition(item, st: { prev: CarouselItem | null; offset: number }) {
  const spacing = (st.prev == null || !item.isVisible) ? 0 : this.getSpacingBetweenPanels(st.prev, item);
  st.offset += spacing;
  item.carouselYPosition = st.offset;            // hidden items get Y too (equal to the next visible slot)
  if (spacing > 0) {                             // fill input gaps
    item.carouselInputLenienceAbove = spacing / 2;
    if (st.prev) st.prev.carouselInputLenienceBelow = item.carouselInputLenienceAbove;
  }
  if (item.isVisible) { st.offset += item.drawHeight; st.prev = item; }
}
// The start offset is visibleHalfHeight, so item 0 can sit at the screen centre (Carousel.cs:857, 389).
// Total scroll content height = finalOffset + visibleHalfHeight (Carousel.cs:896).
```
Spacing (`osu/osu.Game/Screens/Select/BeatmapCarousel.cs:53, 66-93`), with `SPACING = 3`:
```ts
getSpacingBetweenPanels(top, bottom): number {
  if ((top.model instanceof GroupDefinition) !== (bottom.model instanceof GroupDefinition)) return 6;
  if (this.grouping.beatmapSetsGroupedTogether) {
    if (bottom.model instanceof GroupedBeatmapSet && bottom.isExpanded) return 6;      // above an expanded set
    if (top.model instanceof GroupedBeatmap && bottom.model instanceof GroupedBeatmapSet) return 6; // below the last diff
    if (top.model instanceof GroupedBeatmap || bottom.model instanceof GroupedBeatmap) return 3;
  } else if (this.currentSelection != null && (top === this.currentSelectionItem || bottom === this.currentSelectionItem)) return 6;
  return -3;                                                                          // headers overlap by 3
}
```
Resulting pitches: collapsed set → set **69** (72 − 3). Diff → diff **48**. Set header → first diff **75** (72 + 3), and the set header itself
is preceded by +6 when expanded. Last diff → next set **51** (45 + 6). Group → group **51** (54 − 3). Group ↔ anything else is +6.

### 3.3 Selection model
Two selections are tracked. `currentSelection` is the real selection and is always a `GroupedBeatmap`. `currentKeyboardSelection` is the visual cursor and can be a set or group header.
`Selection = { model, carouselItem?, yPosition?, index? }` (`Carousel.cs:1185`).
```ts
// Carousel.CurrentSelection setter (Carousel.cs:110-141)
set currentSelectionModel(value) {
  if (!this.checkModelEquality(this.currentSelection.model, value)) {
    this.handleItemSelected(value);                       // BeatmapCarousel: expand group + set
    if (this.currentSelection.model != null) this.handleItemDeselected(this.currentSelection.model);
    this.currentSelection = new Selection(value);
    this.currentKeyboardSelection = this.currentSelection;
    this.selectionValid.invalidate();
  }
  if (!this.checkModelEquality(this.currentKeyboardSelection.model, value)) {  // re-selecting the same value still resets the keyboard cursor
    this.currentKeyboardSelection = this.currentSelection;
    this.selectionValid.invalidate();
  }
}
```
`refreshAfterSelection()` (`Carousel.cs:855-902`) runs when `selectionValid` is invalid (on the next Update), after every filter, and on any **DrawSize change**
(`:1165-1172`). It:
1. Resets both selections to model-only.
2. Re-finds their items through `grouping.itemMap` (`BeatmapCarousel.cs:476-483`).
3. Recomputes all Y positions.
4. Sets `selection.yPosition = item.y + item.drawHeight/2`.
5. Sets the scroll content height.
6. **Keeps the view stable**: if the keyboard selection's Y moved by Δ, it calls `Scroll.OffsetScrollPosition(Δ)`. That shifts both scroll Current and Target and adds Δ to every panel's `drawYPosition`.

After `refreshAfterSelection` from an invalidated selection, `ScrollToSelection()` (animated) always runs, whether or not the user is scrolling (`Carousel.cs:964-972`).

### 3.4 Visible range and virtualisation
```ts
// Carousel.Update (Carousel.cs:953-1007)
visibleBottomBound = scroll.current + drawHeight + bleedBottom;
visibleUpperBound  = scroll.current - bleedTop;
visibleHalfHeight  = (drawHeight + bleedBottom + bleedTop) / 2;

// getDisplayRange (Carousel.cs:1051-1071). DistanceOffscreenToPreload = 100 (BeatmapCarousel.cs:98)
let first = lowerBound(items, visibleUpperBound - 100);   // ~BinarySearch
let last  = lowerBound(items, visibleBottomBound + 100);
first = Math.max(0, first - 1); last = Math.max(0, last - 1);
```
`updateDisplayedRange` (`Carousel.cs:1073-1145`):
- `toDisplay = items[first..last].filter(isVisible)`.
- For each live panel (skipping expiring panels, whose `item` is null): if a model-equal item is in `toDisplay`, **reuse** the panel by setting `panel.item = thatItem`.
  This triggers a full `PrepareForUse` (§4.3). Otherwise call `expirePanel(panel)`.
- For each remaining item, get a panel from its pool (§3.9), set `panel.item = item` and `panel.drawYPosition = item.y`, and add it.
- **Spawn-from-above**: take the panels whose screen quad intersects the scroll area, sort them by item Y, and for each *new* panel at index `i` with `0 < i < n−1`, set
  `panel.drawYPosition = orderedPanels[i−1].drawYPosition`. The first and last are excluded.

`expirePanel` (`Carousel.cs:1147-1163`):
```ts
expirePanel(panel) {
  scroll.panels.changeChildDepth(panel, panel.depth + 1024);  // behind everything
  panel.fadeOut(150, Easing.OutQuint);
  panel.moveToX(panel.x + 100, 200, Easing.Out);              // Update no longer drives X (item is null)
  panel.expire();                                              // removed + returned to pool when its transforms end (200 ms)
  panel.item = null; panel.selected.value = panel.keyboardSelected.value = panel.expanded.value = false;
}
```

### 3.5 Per-frame panel driving (`Carousel.cs:982-1003`)
```ts
const selectedY = currentSelection.carouselItem?.carouselYPosition ?? 0;
for (const panel of scroll.panels) {
  const item = panel.item; if (!item) continue;
  const normalisedDepth = Math.abs(selectedY - item.carouselYPosition) / this.drawHeight;
  scroll.panels.changeChildDepth(panel, item.depthLayer + normalisedDepth); // lower depth = drawn on top
  if (panel.drawYPosition !== item.carouselYPosition)
    panel.drawYPosition = dampContinuously(panel.drawYPosition, item.carouselYPosition, 50, time.elapsed);
  panel.x = this.getPanelXOffset(panel);
  panel.selected.value = currentSelection.carouselItem != null && item === currentSelection.carouselItem; // CheckModelEquality falls back to reference equality for CarouselItem
  panel.keyboardSelected.value = item === currentKeyboardSelection.carouselItem;
  panel.expanded.value = item.isExpanded;
}
// dampContinuously(cur, target, halfTime, dt) = lerp(cur, target, 1 - 0.5 ** (dt / halfTime))  (fw/Utils/Interpolation.cs:27-51)
```
**Drawing order**: groups (−2) above sets (−1) above difficulties (0). Within a layer, the panel nearest the selection is on top. The term
`normalisedDepth` is unbounded, so a far-away header can sort behind a nearby difficulty. Port this exactly. Expiring panels add +1024.

Panel screen Y is written by the scroll container (`osu/osu.Game/Graphics/Carousel/Carousel.ScrollContainer.cs:94-102`):
`panel.y = panel.drawYPosition − scroll.current`. The ScrollContent itself does not move. Note that `OffsetScrollPosition` also shifts every panel's `drawYPosition` (`:64-70`).

### 3.6 Curvature ("distance from centre") X offset
```ts
// Carousel.GetPanelXOffset + offsetX (Carousel.cs:1027-1049)
getPanelXOffset(panel): number {
  const posInScrollY = scroll.toLocalSpace(panel.screenSpaceDrawQuad.centre).y; // panel centre, scroll-local
  const dist = Math.abs(1 - (posInScrollY + bleedTop) / visibleHalfHeight);       // 0 at screen centre, 1 at top/bottom of the bleed area
  const R = 3;
  return (R - Math.sqrt(Math.max(0, R*R - dist*dist))) * visibleHalfHeight;
}
// BeatmapCarousel adds the focus offset (BeatmapCarousel.cs:764-778):
//   selectionFocusOffset = dampContinuously(selectionFocusOffset, visuallyFocusSelected ? 300 : 0, 100, dt)  (every Update)
//   x = base + (panel.selected ? 0 : selectionFocusOffset)
```
The value is written straight to `panel.X` every frame, with no transform. Because `Anchor = TopRight`, a positive X moves the panel right.
Worked example: a 768-unit-tall screen gives `visibleHalfHeight = 384` (`BleedTop = 136`, `BleedBottom = 55`, carousel height 577). The offset is 0 at the centre,
≈16.1 at dist 0.5, and ≈65.9 at the top or bottom edge. `VisuallyFocusSelected` is set true on `OnSuspending` and false when arriving at the screen
(`SongSelect.cs:704, 728`). On leaving for gameplay, every non-selected panel slides 300 right with a 100 ms half-life.
The real code reads the screen quad from the previous frame's layout. Using the panel's current Y in the port is fine.

### 3.7 Scrolling, scroll-to-selection, physics
- `ScrollToSelection(immediate = false)` sets a pending flag. **Immediate wins over standard** (`Carousel.cs:167-174`). In `UpdateAfterChildren`
  (`:1009-1020`): `target = GetScrollTarget()`, which is the keyboard selection centre Y. If null, `BeatmapCarousel` falls back to the expanded set's item Y,
  then to the expanded group's (`BeatmapCarousel.cs:692-712`). Then `Scroll.ScrollTo(target − visibleHalfHeight + bleedTop, animated: !immediate)`.
  Net effect: the keyboard selection's centre lands at the **vertical centre of the full screen**.
- `ScrollTo` (through `UserTrackingScrollContainer`) sets `UserScrolling = false` (`osu/osu.Game/Graphics/Containers/UserTrackingScrollContainer.cs:56-60`).
  Wheel, drag, scrollbar and absolute scroll set it true.
- Framework scroll physics (`fw/Graphics/Containers/ScrollContainer.cs`). The full model lives in `framework.md`. The constants:
  `ScrollDistance = 80` per wheel notch (`:83`); `ClampExtension = 500` (`:90`); `DistanceDecayDrag = 0.0035` (`:100`); `DistanceDecayScroll = 0.01` (`:105`);
  `DistanceDecayJump = 0.01` (`:110`), used by ScrollTo; precise (trackpad) wheel decay `0.05` (`:411`); `distance_decay_clamping = 0.012` (`:95`).
  Per frame: `current = lerp(target, current, exp(−decay·dt))` (`:555`). The overscroll spring is at `:535-552`. The drag flick velocity is
  `averageDragDelta/averageDragTime`, using exponential averaging with factor `0.95^dt` and cutoff 0.1 (`:333-387`). Target clamping: `Clamp(value, 500)` (`:478`).
- **Absolute scroll**. `AbsoluteScrollSongList` has no default key (`osu/osu.Game/Input/Bindings/GlobalActionContainer.cs:248`), but a **right mouse button**
  press anywhere also starts it, unless a hovered drawable has a context menu. All panels have context menus (`Carousel.ScrollContainer.cs:193-231`).
  While it is active, every mouse move calls `ScrollTo(clamp(fromScrollbarPos(mouseY) − fromScrollbarPos(scrollbarH)·0.5), animated, decay 0.02)`
  (`osu/osu.Game/Graphics/Containers/OsuScrollContainer.cs:65-73`). `ScrollContainer.ReceivePositionalInputAt` is always true (`Carousel.ScrollContainer.cs:51`),
  so a right-drag works anywhere on screen that is not covered by something else.
- When the mouse enters the left wedge area (minus 40 units of right padding), the carousel runs an animated `ScrollToSelection()`. Plain wheel scrolls
  there are swallowed (`osu/osu.Game/Screens/Select/LeftSideInteractionContainer.cs:30-56`, `SongSelect.cs:228-237`).

### 3.8 Scrollbar (`Carousel.ScrollContainer.cs:104-125, 237-341`)
- Container size: `SCROLL_BAR_WIDTH·2 = 20` wide (`OsuScrollContainer.cs:32`), left and right margin 3. It holds a `Circle` anchored TopRight with relative width **0.5** (10 units).
  Blending is **additive**. `MinimumDimSize = 30`.
- Track mapping uses `ScrollbarPaddingTop = 5` and `ScrollbarPaddingBottom = 70` ("osu! logo in the way", `BeatmapCarousel.cs:101`):
  `pos = 5 + (movementExtent − 75) · current/scrollableExtent`.
- Length: `ResizeTo(clamp(displayable/available, min(30/size, 1), 1), 200, OutQuint)`. Visibility: `FadeTo(visible ? 1 : 0, 200)` (`fw/.../ScrollContainer.cs:573-574`).
- Colours. The container colour is Gray8 `#888888`. The box fades in 100 ms to: mouse down → `Highlight1 #66ccff`, hovered → GrayF `#ffffff`, otherwise → Gray8.
  The container tint multiplies the box colour (in linear space), so the resting colour after any hover is darker than the very first render. This is a source quirk. Port it faithfully.
- Width: on hover or drag the box goes to width 1 over 300 ms `OutElasticHalf`. Otherwise it returns to 0.5 over 200 ms `OutQuint`.

### 3.9 Pools (`BeatmapCarousel.cs:874-891, 933-962`)
Initial pool sizes: PanelBeatmap 100, PanelBeatmapStandalone 100, PanelBeatmapSet 100, PanelGroup 100, PanelGroupStarDifficulty 11, PanelGroupRankDisplay 9,
PanelGroupRankedStatus 8. Pools grow without limit. `GroupedBeatmap` uses Standalone when sets are not grouped. Getting a set panel also sets its `VisibleBeatmaps` (§5.2).
Pooled panels pre-load at song-select load, so they are fully built before first use.

---

## 4. Panel base (`osu/osu.Game/Screens/Select/Panel.cs`)

### 4.1 Constants
`CORNER_RADIUS = 10` (`:30`), `active_x_offset = 25` (`:32`), `DURATION = 400` (`:34`). PanelXOffset per type: Beatmap **60** (`PanelBeatmap.cs:74`),
Set **20** (`PanelBeatmapSet.cs:86`), Standalone **20** (`PanelBeatmapStandalone.cs:78`), Groups **0** (default).
Heights: Beatmap **45**, Set **72** (45·1.6), Standalone **72**, all Group types **54** (45·1.2) (`PanelBeatmap.cs:36`, `PanelBeatmapSet.cs:39`, `PanelBeatmapStandalone.cs:32`, `PanelGroup.cs:29`).

### 4.2 Drawable tree (back to front) (`Panel.cs:98-168`)
```
Panel (Anchor=Origin=TopRight, RelativeSizeAxes=X, Height=H)
└─ TopLevelContent: Container (Masking, CornerRadius 10, RelSize Both, X = 10 initially, EdgeEffect hollow shadow)
   ├─ backgroundContainer (RelSize Both)       ← subclass "Background" (left strip colour shows through)
   ├─ iconContainer (Anchor/Origin CentreLeft, AutoSize Both)  ← subclass "Icon"
   ├─ contentPaddingContainer (RelSize Both, Padding.Left = iconContainer.DrawWidth, refreshed EVERY frame, :395-399)
   │   └─ Content (RelSize Both, Masking, CornerRadius 10) ← subclass content
   ├─ hoverLayer: Box  Colour = OsuColour.Blue #66ccff @ α0.1, Additive, Alpha 0
   ├─ selectionLayer: PulsatingBox  RelSize Both, Width 0.8, Anchor/Origin TopRight, Additive, Alpha 0
   │     colour = GradientHorizontal(accent@α0, accent@α0.5), accent = AccentColour ?? white (:322-329)
   ├─ keyboardSelectionLayer: Box  GradientHorizontal(Highlight1 #66ccff @α0.1, @α0.4), Additive, Alpha 0
   ├─ activationFlash: Box  white @α0.4, Additive, Alpha 0
   └─ HoverSounds (UI/default-hover)
```
Because Content's left padding equals the icon width, the **Background shows as a left strip** the width of the icon. It also shows behind
Content's rounded corners, which gives the coloured left edge.

Input: `ReceivePositionalInputAt` uses `TopLevelContent.DrawRectangle` inflated by `item.carouselInputLenienceAbove/Below` (`:78-93`). Click →
`carousel.Activate(item)` when the item is not null (`:311-320`). Every panel has a right-click context menu (`IHasContextMenu`).

### 4.3 Pool lifecycle
```ts
// Panel.PrepareForUse (Panel.cs:285-299). Runs on the first Update after Get(), and again whenever `item` is replaced while non-null (:407-428)
prepareForUse() {
  this.selectionLayer.depthLayer = -this.item.depthLayer;   // 0 diff, 1 set, 2 group
  this.updateAccentColour();
  this.updateXOffset(false);
  this.updateSelectedState(false);
  this.fadeIn(400, Easing.OutQuint);   // from 0 when the instance was used before (FreeAfterUse hid it); a fresh instance is already at α1, so no visible fade
}
freeAfterUse() { this.hide(); this.item = null; }        // Panel.cs:301-309
```
Order within one frame for a new panel: `Carousel.Update` adds the panel and sets `selected/keyboardSelected/expanded`. Those bindables fire
animated updates. The panel's own Update then runs `PrepareForUse`, which snaps X and state with duration 0. Net effect: **new panels appear already in their correct X and state**.

### 4.4 X offset state machine (`Panel.cs:365-381`)
```ts
updateXOffset(animated = true) {
  let x = this.panelXOffset + 10;
  if (!this.expanded.value && !this.selected.value)
    x += (this instanceof PanelBeatmap || this instanceof PanelBeatmapStandalone) ? 50 : 100;
  if (!this.keyboardSelected.value) x += 25;
  this.topLevelContent.moveToX(x, animated ? 400 : 0, Easing.OutQuint);   // new MoveToX interrupts the old one from its current value
}
// called on Selected, Expanded and KeyboardSelected value changes (Panel.cs:254-283) and in PrepareForUse
```
Resulting TopLevelContent.X:

| Panel | sel/exp + kbd | sel/exp only | kbd only | neither |
|---|---|---|---|---|
| PanelBeatmap (60) | 70 | 95 | 120 | 145 |
| PanelBeatmapSet (20) | 30 | 55 | 130 | 155 |
| PanelBeatmapStandalone (20) | 30 | 55 | 80 | 105 |
| PanelGroup* (0) | 10 | 35 | 110 | 135 |

Common cases: after selecting a difficulty, the selection is also the keyboard cursor, so the selected difficulty sits at 70 and its expanded set header at 55.
Other difficulties sit at 145, other sets at 155, and the expanded group at 35.

### 4.5 Selected / expanded visuals (`Panel.cs:331-363`, `:170-252`)
```ts
updateSelectedState(animated = true) {
  const on = this.expanded.value || this.selected.value;
  const edge = this.accentColour ?? hex('#4EBFFF');
  // EdgeEffect type/radius/offset switch INSTANTLY. Only the colour fades:
  this.topLevelContent.edgeEffect = on
    ? { type: 'shadow', radius: 2, hollow: true }
    : { type: 'shadow', radius: 4, hollow: true, offset: {x: 0, y: 1} };
  this.topLevelContent.fadeEdgeEffectTo(on ? withAlpha(edge, 0.8) : rgba(0,0,0,0.2), animated ? 400 : 0, Easing.OutQuint);
  if (on) this.selectionLayer.fadeIn(100, Easing.OutQuint); else this.selectionLayer.fadeOut(200, Easing.OutQuint);
}
```
`PulsatingBox` is a `BeatSyncedContainer` with `EarlyActivationMilliseconds = 40`. Its inner Box alpha starts at 1:
```ts
onNewBeat(beatIndex, timingPoint) {           // runs inside beginDelayedSequence(-timeSinceLastBeat), so transforms start AT the beat time
  if (beatIndex % flashInterval(timingPoint.timeSignatureNumerator, this.depthLayer) !== 0) return;
  let length = timingPoint.beatLength; while (length < 250) length *= 2;
  this.box.fadeTo(0.8, 40, Easing.Out).then().fadeTo(0.4, length, Easing.Out);  // each beat restarts the chain (interrupts the previous)
}
flashInterval(beatsPerBar, depthLayer) {     // Panel.cs:219-251
  let beatsPerFlash = 1, remaining = beatsPerBar;
  for (let i = 0; i < depthLayer; i++) {
    let f = smallestPrimeFactor(remaining); if (f <= 1) f = 2;
    beatsPerFlash *= f; if (remaining % f === 0) remaining /= f;
  }
  return beatsPerFlash;   // 4/4: diff 1, set 2, group 4. 3/4: diff 1, set 3, group 6
}
```
When the track is not running, the BeatSyncedContainer uses `TimingControlPoint.DEFAULT` (60000/60 = 1000 ms beat) on the local clock
(`osu/osu.Game/Graphics/Containers/BeatSyncedContainer.cs:118-126`). See the beat-sync spec for details.

### 4.6 Keyboard selection, hover, activation
```ts
// KeyboardSelected (Panel.cs:270-282)
if (kbd) keyboardSelectionLayer.fadeIn(80, Easing.Out).then().fadeTo(0.5, 2000, Easing.OutQuint);
else     keyboardSelectionLayer.fadeOut(1000, Easing.OutQuint);   // removes the pending .then() part. Fades from the current alpha
updateXOffset();
// Hover (Panel.cs:383-393)
onHover()     { hoverLayer.fadeIn(100, Easing.OutQuint); return true; }
onHoverLost() { hoverLayer.fadeOut(1000, Easing.OutQuint); }
// Activated (Panel.cs:436-439)
activated()   { activationFlash.fadeOutFromOne(1000, Easing.OutQuint); }   // snap to α1, then fade to 0
```
Hover sound: `res/Samples/UI/default-hover.wav` with random pitch `1 ± 0.02`. A **global** 20 ms debounce applies, shared across all hover sounds
(`SessionStatics.LastHoverSoundPlaybackTime`). It does not play while any mouse button is held (`osu/osu.Game/Graphics/UserInterface/HoverSounds.cs:36-46`,
`osu/osu.Game/Graphics/UserInterface/HoverSampleDebounceComponent.cs:30-45`, `osu/osu.Game/OsuGameBase.cs:100`). The hit test uses TopLevelContent's own rectangle, without the lenience.

---

## 5. Panel types

Colour provider: song select caches `OverlayColourProvider(Blue)`, hue 200 (`SongSelect.cs:113-114`, `osu/osu.Game/Overlays/OverlayColourScheme.cs:46-47`).
`getColour(s, l) = HSL(200/360, s, l)` (`osu/osu.Game/Overlays/OverlayColourProvider.cs:35-70`):

| Name | (s, l) | hex |
|---|---|---|
| Highlight1 | (1, .7) | `#66ccff` rgba(102,204,255,1) |
| Content1 | (.4, 1) | `#ffffff` |
| Content2 | (.4, .9) | `#dbe9f0` rgba(219,233,240,1) |
| Light1 | (.4, .8) | `#b8d3e0` |
| Light2 | (.4, .75) | `#a6c8d9` |
| Background1 | (.1, .4) | `#5c6970` |
| Background3 | (.1, .25) | `#394246` rgba(57,66,70,1) |
| Background4 | (.1, .2) | `#2e3538` rgba(46,53,56,1) |
| Background5 | (.1, .15) | `#22282a` rgba(34,40,42,1) |
| Background6 | (.1, .1) | `#171a1c` rgba(23,26,28,1) |

(Values are rounded from float HSL and may be ±1 per channel.) `Darken(a)` multiplies RGB by `1/(1+a)`. `Lighten(a)` multiplies by `1+a`
(`fw/Extensions/Color4Extensions/Color4Extensions.cs:106-113`). Colour tweens and colour-gradient sampling interpolate in **linear** RGB
(`fw/Utils/Interpolation.cs:259-280`).

Fonts (`osu/osu.Game/Graphics/OsuFont.cs:16-56`): Title = TorusAlternate Regular 32; Heading1 = Torus Bold 22; Heading2 = Torus SemiBold 18;
Body = Torus Regular 16; Caption1 = Torus Regular 14; Caption2 = Torus Regular 12. Files are `res/Fonts/Torus/Torus-{Regular,SemiBold,Bold}.bin` and
`res/Fonts/Torus-Alternate/Torus-Alternate-{Regular,Bold}.fnt`. `OsuSpriteText` has a shadow by default: black α0.2, offset `(0, 0.06·fontSize)`
(`osu/osu.Game/Graphics/Sprites/OsuSpriteText.cs:19`, `fw/Graphics/Sprites/SpriteText.cs:191, 210`).

### 5.1 PanelBeatmap: difficulty under an expanded set (`osu/osu.Game/Screens/Select/PanelBeatmap.cs`)
- **Icon**: `ConstrainedIconContainer` 9×9, margin L2.5 R1.5, so the strip is **13** wide. It holds the ruleset icon
  (`res/Textures/Icons/Ruleset{Osu,Taiko,Catch,Mania}.png`, 90×90 grey+alpha, tinted). Colour starts at Background5 and is then **set every frame** to
  the StarRatingDisplay text colour (`:82-87, 280-283`).
- **Background**: Box, colour = difficulty colour (strip).
- **Content** (`:94-192`), back to front:
  1. Box `GradientHorizontal(Background3 #394246, Background4 #2e3538)`
  2. Tint Box `GradientHorizontal(diff@α0.25, diff@α0)`
  3. `TrianglesV2 { ScaleAdjust 1.2, Thickness 0.01, Velocity 0.3 }`, colour `GradientVertical(diff@α0.25, diff@α0)`
  4. Horizontal FillFlow, CentreLeft, spacing 5, margin left 6.5:
     - `PanelLocalRankDisplay`, scale 0.8: a 40×20 rank badge (§5.7), hidden when there is no local score.
     - `mainFill`, vertical, padding bottom 3.5. Margin left `= (hasRank ? 0 : −3) / 0.875` = **−3.4286** with no rank (`:265`).
       - Row 1, horizontal, padding bottom 4, children anchored BottomLeft:
         - `variantText`: Torus SemiBold 16, alpha 0. Shown as `"[{variant}] "` only for rulesets with more than one gameplay variant (mania keys) (`:286-303`).
         - `difficultyText`: Torus SemiBold 16, `beatmap.DifficultyName`, margin right 3.
         - `authorText`: Torus SemiBold 14, colour Content2 `#dbe9f0`, `"mapped by {author}"`.
       - Row 2, horizontal, spacing 3:
         - `StarRatingDisplay(Small, animated)`, scale 0.875 (§8.1).
         - `StarCounter`, scale 0.4, colour = diff (§8.2).
- Accent update every frame (`:267-278`): when `starRatingDisplay.DisplayedDifficultyColour` changes, set `AccentColour`, starCounter colour, strip colour,
  tint gradient and triangle gradient.
- With no local rank (the offline default), the X positions are: rank wrapper width 0, then spacing 5, then margin −3.43. So the text column starts at about **8.07** units from Content's left edge.
- Star rating source: `difficultyCache.GetBindableDifficulty(beatmap, token, 150)`. It starts with `beatmap.StarRating` (`osu/osu.Game/Beatmaps/BeatmapDifficultyCache.cs:132-138`),
  then the ruleset- and mod-adjusted value after a **150 ms** debounce (`SongSelect.cs:76`). Calculation is cancelled while the item is invisible (`:257-261`).
- Context menu: song select "forward actions" (Play, Edit, …). Stub this visually.

### 5.2 PanelBeatmapSet: set header (`osu/osu.Game/Screens/Select/PanelBeatmapSet.cs`)
- **Icon**: Container size **(0, 22)** holding a `FontAwesome.Solid.ChevronRight` icon, 8×8, centred, X +1, colour Background5 (`:94-106`).
- **Background**: white Box at α0 (`:108-113`).
- **Content**: `PanelSetBackground` (§5.6), then a vertical FillFlow, CentreLeft, padding T7.5 L15 B13 (`:115-166`):
  - Title: **TorusAlternate Bold 22** (Heading1 with the typeface swapped), romanisable title.
  - Artist: Torus SemiBold 16.
  - Row (margin top 4):
    - `BeatmapSetOnlineStatusPill` (text size 12, margin R5, `Animated = false`; §8.3)
    - `PanelUpdateBeatmapButton` (margin R5, T−2; §5.8)
    - `SpreadDisplay`
- Background image choice: the working beatmap of the difficulty with the **lowest OnlineID**, retrieved 50 ms after PrepareForUse (`:202`).
- Expansion animation (`:177-193`):
```ts
onExpanded() {
  if (expanded) {
    chevronBackground.fadeIn(200, Easing.OutQuint);
    chevronIcon.resizeWidthTo(18, 600, Easing.OutElasticQuarter);
    chevronIcon.fadeTo(1, 400, Easing.OutQuint);
  } else {
    chevronBackground.fadeOut(400, Easing.OutQuint);
    chevronIcon.resizeWidthTo(0, 400, Easing.OutQuint);
    chevronIcon.fadeTo(0, 400, Easing.OutQuint);
  }
  spreadDisplay.expanded = expanded;
}  // bound with runOnceImmediately at LoadComplete. Content's left padding follows the animated chevron width every frame
```
  The expanded header therefore shows an 18-unit white strip with a dark chevron. It glows with `#4EBFFF` α0.8 (AccentColour stays null). The selection gradient is white α0→0.5.
- `AccentColour` is never set for set panels.
- **SpreadDisplay** (`osu/osu.Game/Screens/Select/PanelBeatmapSet.SpreadDisplay.cs`) is an `OsuAnimatedButton` with AutoSize X, Height 14, and content corner radius 5 (`:57-62`).
  It holds a FillFlow (spacing 5, padding H5): a `flow` FillFlow (spacing 1) then an Eye icon (12, α0) (`:67-94`).
```ts
updateBeatmapSet() {   // :116-210
  if (!beatmapSet) { this.fadeOut(200, Easing.OutQuint); return; }
  flow.clear();
  const beatmaps = set.beatmaps.filter(b => allowGameplayWithRuleset(b, ruleset, showConverted));
  this.fadeTo(beatmaps.length ? 1 : 0, 200, Easing.OutQuint); if (!beatmaps.length) return;
  const MAX = 12;
  const showVisible = visibleBeatmaps == null || visibleBeatmaps.size <= MAX;
  const showHidden  = beatmaps.length <= MAX;
  for (const [rulesetId, group] of groupBy(beatmaps, b => b.ruleset.onlineID).sort(byKey)) {
    flow.add(rulesetIcon(rulesetId, { size: 14, anchor: 'CentreLeft', marginLeft: flow.count > 0 ? 9 : 0 }));
    let overflowVisible = 0, overflowHidden = 0, lastVisible: boolean | null = null;
    for (const b of group.sort(byStarRating)) {
      const visible = visibleBeatmaps?.has(b) !== false;   // "visible" = passed the current filter
      if ((visible && showVisible) || (!visible && showHidden)) {
        flow.add(circle({ size: visible ? [7, 12] : [5, 10], alpha: visible ? 1 : 0.5,
          colour: forStarDifficulty(b.starRating),          // stored SR, not the live mod-adjusted value
          marginLeft: lastVisible != null && lastVisible !== visible ? 1 : 0 }));
        lastVisible = visible;
      } else visible ? overflowVisible++ : overflowHidden++;
    }
    if (overflowVisible) flow.add(text(`${overflowVisible}`, Caption2));           // Torus Regular 12
    if (overflowHidden)  flow.add(text(`+${overflowHidden}`, Caption2, { alpha: 0.7 }));
  }
  action = () => songSelect.scopeToBeatmapSet(set);
}
enabled = expanded && !scoped.disabled && scoped.value == null;              // :212-215
updateAppearance(i = enabled && isHovered) { hoverColour = i ? white@0.1 : transparent; eye.fadeTo(i ? 1 : 0, 200, Easing.OutQuint); }
```
  Button base (`osu/osu.Game/Graphics/UserInterface/OsuAnimatedButton.cs`): the hover box is additive. Hover in: 500 ms `OutQuint`. Hover out: 500 ms. Click: `FlashColour(white@0.3, 800, OutQuint)`.
  Mouse down: `Content.ScaleTo(0.75, 2000, OutQuint)`. Mouse up: `ScaleTo(1, 1000, OutElastic)`. The content has a shadow of black α0.04 radius 5. `DimColour` is overridden to white, so a disabled button is not dimmed.
  Samples: `res/Samples/UI/button-hover.wav` and `button-select.wav` (`osu/osu.Game/Graphics/UserInterface/HoverClickSounds.cs:42-58`). When disabled, mouse-down and click fall through to the panel.
- `VisibleBeatmaps` = the beatmaps of this set's items in the current filter output (`BeatmapCarousel.cs:964-971`). It is refreshed for live set panels after each filter (`:513-514`).
- Context menu: Expand (collapsed only) or Edit; Details / Copy link (online); Collections; Restore hidden; Delete. Stub it.

### 5.3 PanelBeatmapStandalone: used when sets are not grouped (`osu/osu.Game/Screens/Select/PanelBeatmapStandalone.cs`)
- **Icon**: ruleset icon, 12×12, margin L4 R3 → strip **19**. Colour = StarRatingDisplay text colour (`:86-91, 297`).
- **Background**: Box = diff colour (strip).
- **Content**: `PanelSetBackground` (the background of *this* difficulty), then a FillFlow (CentreLeft, spacing 5, margin L6.5): localRank (scale 0.8), then mainFill
  (vertical, padding bottom 4.8, same −3.43 margin hack) (`:98-205`):
  - Title: **TorusAlternate Bold 18**.
  - Artist: Torus SemiBold 14, padding top −2.
  - Row (padding T2 B2, BottomLeft-anchored):
    - status pill (text 12, margin R4, `beatmap.Status`)
    - update button (scale 0.8, margin R4, B−1)
    - keyCountText (Torus SemiBold 16, mania only)
    - difficulty name (Torus SemiBold 16, margin R3)
    - "mapped by X" (Torus SemiBold 14, Content2)
  - Row (spacing 3): StarRatingDisplay (Small, 0.875), then SpreadDisplay.
- `Selected` drives `Expanded` (`:215-218`), so a selected standalone panel shows the glow and pulse.
- Accent is set **every frame**, without a change check (`:291-297`).
- **SpreadDisplay** (`osu/osu.Game/Screens/Select/PanelBeatmapStandalone.SpreadDisplay.cs`): RelSize Y; content radius 5. The flow (spacing 5, padding H5) holds
  `[preceding(α0.5, spacing 1), Current Circle 7×12 (colour = diff colour), succeeding(α0.5, spacing 1)]` with inner spacing 2, a "+N" Caption2 count, and an Eye icon (12) (`:70-128`).
  Dots are the *other* difficulties of the set that are allowed for the ruleset, sorted by SR. Each is 5×10 and coloured `forStarDifficulty(sr)`. A dot goes to `preceding` if its SR is below the current one.
  At most 11 dots show, windowed around the current difficulty (`:172-206`). Fade ramps at truncated ends: preceding `α=(1+4(i+1)/n)/5`; succeeding `α=(1+4(n−i)/n)/5` (`:212-228`).
  The whole display is hidden when a set scope is active (`:152-156`). Enabled when Selected. When interactable, the preceding and succeeding groups fade to 1 and the eye fades in (200 ms `OutQuint`). Click scopes to the set.

### 5.4 PanelGroup (`osu/osu.Game/Screens/Select/PanelGroup.cs`)
- **Icon**: Container (RelSize Y, `AlwaysPresent`, α0, width starts 0) holding a ChevronDown icon, 12×12, colour Background3 (`:46-59`).
- **Background**: Box Highlight1 `#66ccff`. `AccentColour = Highlight1` (`:61-67`).
- **Content** (`:68-119`):
  1. Box Background5
  2. `TrianglesV2 { Thickness 0.02, SpawnRatio 0.6 }`, `GradientHorizontal(Background6, Background5)`
  3. glow Box, Width 0.5, `GradientHorizontal(Highlight1, Highlight1@α0)`, α0
  4. Title: Torus SemiBold 18 (Heading2), CentreLeft, X 10, `UseFullGlyphHeight = false`
  5. Count pill: CircularContainer 50×14, CentreRight, margin right 30, black α0.7 Box. Text Torus Bold 14, `NestedItemCount` with thousands separators.
     `countPill.X = −TopLevelContent.X` every frame, which keeps it **pinned to the screen** while the panel slides (`:156-162`).
- Expansion (`:129-142`), duration 500 `OutQuint`: icon width 20 / 5 and α 1 / 0; triangles `FadeColour` → expanded `GradientHorizontal(Highlight1@0.25, Highlight1@0)` / collapsed `(Background6, Background5)`;
  glow α 0.4 / 0. Note the icon is 5 wide even when collapsed, so a 5-unit Highlight1 strip is always visible.

### 5.5 Group subclasses (same layout as PanelGroup; text in a FillFlow at margin L10)
- **PanelGroupStarDifficulty** (`osu/osu.Game/Screens/Select/PanelGroupStarDifficulty.cs:143-174`): `rating = stars ≥ 9 ? Gray(0.2) #333333 : forStarDifficulty(stars)`.
  Accent and strip = rating; content box = `rating.Darken(1)` (×0.5); glow gradient rating → transparent; icon = `stars ≥ 7 ? Content1 : Background5`; text Content1.
  Triangles: `stars ≥ 8 ? (rating, rating.Darken(0.2)) : (rating.Darken(0.6), rating.Darken(0.8))`. Expansion animates only the icon and glow (500 `OutQuint`).
- **PanelGroupRankedStatus** (`osu/osu.Game/Screens/Select/PanelGroupRankedStatus.cs:144-182`): colour = `ForBeatmapSetOnlineStatus` (§8.3). Graveyard becomes Gray5 `#555555` with a white icon. Triangles use `Darken(0.6) → Darken(0.8)`.
- **PanelGroupRankDisplay** (`osu/osu.Game/Screens/Select/PanelGroupRankDisplay.cs:142-192`): colour = `OsuColour.ForRank` (XH/X `#de31ae`, SH/S `#02b5c3`, A `#88da20`, B `#e3b130`, C `#ff8e5d`, D `#ff5a5a`, F `#3f3f3f`)
  (`osu/osu.Game/Graphics/OsuColour.cs:81-109`). Text colour = rank-letter colour for S/SS/F, white otherwise.

### 5.6 PanelSetBackground (`osu/osu.Game/Screens/Select/PanelSetBackground.cs`)
- Container (RelSize Both, CornerRadius 10, Masking, **MaskingSmoothness 2**) (`:72-80`).
- Children by depth (`:92-131`):
  1. back: Box `GradientHorizontal(Background3, Background4)`
  2. middle: the image sprite (Anchor/Origin Centre, RelSize Both, **FillMode.Fill**)
  3. front: horizontal FillFlow with **Shear (0.8, 0)** holding Box W0.4 `black@0.5`, Box W0.2 `Gradient(black@0.5 → black@0.3)`, Box W0.45 `Gradient(black@0.3 → black@0.2)` (total width 1.05)
- Shear convention: the framework applies `x' = x − 0.8·y` about the origin, TopLeft (`fw/Graphics/DrawInfo.cs:48`, `fw/Extensions/MatrixExtensions/MatrixExtensions.cs:86-91`).
  In CSS this is `transform-origin: 0 0; transform: skewX(-38.66deg)` (atan 0.8). The dark band edges lean "/".
- Image crop (`osu/osu.Game/Beatmaps/BeatmapPanelBackgroundTextureLoaderStore.cs:21, 60-89`). The texture is pre-cropped to a vertically centred strip of
  aspect ≥ 512/80 = **6.4:1** (`usableHeight = min(h, ceil(w/6.4))`) and then drawn with Fill (cover, centred). Port: crop the centre strip, then `object-fit: cover; object-position: center`.
- Load timing (`:134-175`): the load starts only after the panel has been "alive" for `|carouselCentreY − panelCentreY| / carouselHeight · 100` ms. Panels near the centre load first, and the load works outward.
  When loaded, `FadeInFromZero(onScreen ? 400 : 0, OutQuint)`. Changing the beatmap expires the old sprite immediately. The same background file hash is a no-op (`:35-67`).
  With no background file, only the gradient and the overlay show.

### 5.7 PanelLocalRankDisplay (`osu/osu.Game/Screens/Select/PanelLocalRankDisplay.cs`)
`UpdateableRank(animate: false)` at 40×20, α0. It shows the best local score's rank for the current ruleset and is visible only when a score exists (`:55-113`).
`DrawableRank` (`osu/osu.Game/Online/Leaderboards/DrawableRank.cs:20-117`): a pill in the rank colour with Triangles, and a Venera Bold 25 letter (spacing −3, padding top 5) in the rank-letter colour.
**Offline port**: there are no scores, so it is always hidden (`HasRank = false` applies the −3 margin hack).

### 5.8 PanelUpdateBeatmapButton (online-only, normally hidden) (`osu/osu.Game/Screens/Select/PanelUpdateBeatmapButton.cs`)
An OsuAnimatedButton, Height 22, AutoSize X. Visible only when `AllBeatmapsUpToDate == false` (`:132`). It holds a SyncAlt icon (12) that spins once per 4000 ms (400 ms while hovered) and the text "Update"
(Torus SemiBold 16), padding H5 V3, spacing 4. A progress fill of white α0.2 is additive. **Offline port**: stub it as always hidden.

---

## 6. Expansion and selection logic (`BeatmapCarousel.cs`)

### 6.1 Activation (click, Enter, Space, or set/group traversal)
```ts
// Carousel.Activate (Carousel.cs:147-158)
activate(item) {
  this.setKeyboardSelection(item.model);
  materialisedPanel(item)?.activated();          // white flash
  this.handleItemActivated(item);
  this.selectionValid.invalidate();
}
// BeatmapCarousel.HandleItemActivated (BeatmapCarousel.cs:361-403)
handleItemActivated(item) {
  try {
    if (item.model instanceof GroupDefinition) {
      if (this.expandedGroup?.equals(item.model)) { this.setExpansionStateOfGroup(this.expandedGroup, false); this.expandedGroup = null; return; }
      this.setExpandedGroup(item.model);
      if (this.currentSelectionItem?.isVisible && this.currentSelection instanceof GroupedBeatmap) this.requestSelection(this.currentSelection);
      return;
    }
    if (item.model instanceof GroupedBeatmapSet) { this.selectRecommendedDifficultyForBeatmapSet(item.model); return; }
    if (item.model instanceof GroupedBeatmap) {
      if (this.currentSelection && equals(this.currentSelection, item.model)) { this.requestPresentBeatmap(item.model.beatmap); return; } // second click = start gameplay (stub)
      this.requestSelection(item.model); return;
    }
  } finally { this.playActivationSound(item); }
}
```
- `selectRecommendedDifficultyForBeatmapSet` collects the set's `GroupedBeatmap`s (in sorted order, i.e. by ruleset then SR ascending) and calls
  `SongSelect.requestRecommendedSelection`. That uses `DifficultyRecommender`, which picks the SR closest to the user's pp-derived recommendation and prefers easier maps
  (`osu/osu.Game/Beatmaps/DifficultyRecommender.cs:100-118`). With no recommendation it uses **`first()`**, the easiest difficulty (`SongSelect.cs:343-347`).
  **Offline port: clicking a set selects its easiest difficulty.**
- `requestSelection` → `SongSelect.queueBeatmapSelection` sets `carousel.CurrentGroupedBeatmap` immediately, so the visuals change at once.
  The global beatmap (wedges, background, music) follows after a **150 ms** debounce, or **300 ms** while any key is held (`SongSelect.cs:69, 429-458, 588-597`).
- `HandleItemSelected(GroupedBeatmap)` calls `setExpandedGroup(gb.group)` and `setExpandedSet(new GroupedBeatmapSet(gb.group, gb.beatmap.set))` (`:405-421`).

### 6.2 Expansion state
```ts
// BeatmapCarousel.cs:595-690
setExpandedGroup(g) { if (this.expandedGroup) this.setExpansionStateOfGroup(this.expandedGroup, false); this.expandedGroup = g; if (g) this.setExpansionStateOfGroup(g, true); }
setExpansionStateOfGroup(g, expanded) {
  const items = grouping.groupItems.get(g); if (!items) return;
  for (const i of items) {
    if (i.model instanceof GroupDefinition) i.isExpanded = expanded;
    else if (!expanded) i.isVisible = false;
    else if (i.model instanceof GroupedBeatmapSet) { i.isVisible = true; this.setExpansionStateOfSetItems(i.model, i.isExpanded); }
    else if (!grouping.beatmapSetsGroupedTogether) i.isVisible = true;
  }
}
setExpandedSet(set) {
  const last = this.expandedBeatmapSet; this.expandedBeatmapSet = set;     // stored even in standalone mode
  if (!grouping.beatmapSetsGroupedTogether) return;
  this.setExpansionStateOfSetItems(last, false); this.setExpansionStateOfSetItems(set, true);
}
setExpansionStateOfSetItems(set, expanded) {
  if (!set) return;
  const canMakeVisible = grouping.groupItems.size === 0 || this.expandedGroup?.equals(set.group);
  for (const i of grouping.setItems.get(set) ?? []) {
    if (i.model instanceof GroupedBeatmapSet) i.isExpanded = expanded;
    else i.isVisible = canMakeVisible && expanded;
  }
}
```
Only one set and one group can be expanded at a time. After each filter, `HandleFilterCompleted` (`:485-515`):
1. Auto-selects if exactly one set matches (`:530-573`).
2. Fixes up the selection's group.
3. Re-applies the expanded set and group to the new items.
4. Refreshes set-panel spread dots.

**What the user sees when selecting a different set.** In the same frame, the old set's difficulty items become invisible and the new set's become visible.
The next Update re-lays out Y. The old difficulty panels expire: they fade out over 150 ms and slide +100 right over 200 ms (`Out`). They sit behind everything.
The new difficulty panels spawn at the draw Y of the panel above them (the set header) and damp down to their slots with a 50 ms half-life. They draw beneath the header (depth layer 0 is below −1).
The view stays stable around the keyboard selection, which is the newly selected difficulty, through `OffsetScrollPosition`. It then animates so the difficulty is at screen centre.
The set header's chevron grows to 18 with `OutElasticQuarter`. The headers' X offsets animate over 400 ms `OutQuint`.

### 6.3 Samples (`BeatmapCarousel.cs:716-757`, `Carousel.cs:804-822`)
| Event | Sample (`res/Samples/...`) |
|---|---|
| Activate a group header | `SongSelect/select-group.wav` |
| Activate a set header | `SongSelect/select-expand.wav` |
| Activate a difficulty (including Up/Down auto-activation in grouped mode) | `SongSelect/select-difficulty.wav` |
| Keyboard cursor move without activation (Up/Down onto a header, PageUp/Down, Home/End) | `SongSelect/select-difficulty.wav`, 20 ms debounced (`Carousel.cs:815-822`) |
| Random | `SongSelect/random-spin.wav` (pitched) + `SongSelect/select-random.wav` (§6.5) |
| Panel hover | `UI/default-hover.wav` (§4.6) |
| Random failed (no items) | `UI/generic-error.wav` (`SongSelect.cs:180, 375-381`) |

Source quirk: `playActivationSound` `return`s inside the switch before it updates `audioFeedbackLastPlaybackTime`, so its 20 ms debounce **never engages**
(`BeatmapCarousel.cs:736-754`). Port it as is: the activation sound always plays.

### 6.4 Keyboard navigation
Bindings: Up/Down = SelectPrevious/Next; Enter/Space/KeypadEnter = Select (`osu/osu.Game/Input/Bindings/GlobalActionContainer.cs:89-94`); Left/Right = Activate Previous/Next Set;
Shift+Left/Right = Expand Previous/Next Group; Shift+Enter = ToggleCurrentGroup; F2 / Shift+F2 = Next / Previous random (`:233-243`); PageUp/PageDown (raw keys,
`Carousel.ScrollContainer.cs:136-150`); Home/End = PlatformAction Move{Backward,Forward}Line (`fw/Platform/GameHost.cs:1488-1489`; on macOS also Cmd+Left/Right, `fw/Platform/MacOS/MacOSGameHost.cs:123-124`).
Enter with any modifiers also activates (`Carousel.cs:462-474`). All traversals are scheduled with `AddOnce`, so at most one per frame per type (`:483-511`).
```ts
// Up/Down (Carousel.cs:601-636). WRAPS around
traverseKeyboardSelection(dir) {
  if (!items?.length) return;
  const orig = kbd.index ?? (dir > 0 ? items.length - 1 : 0); let i = orig;
  do {
    i = (i + dir + items.length) % items.length;
    const it = items[i];
    if (it.isVisible) {
      if (!equals(currentSelection.model, it.model) && this.shouldActivateOnKeyboardSelection(it)) this.activate(it); // grouped mode + difficulty
      else { this.playTraversalSound(); this.setKeyboardSelection(it.model); }
      return;
    }
  } while (i !== orig);
}
// shouldActivateOnKeyboardSelection = setsGroupedTogether && item is GroupedBeatmap   (BeatmapCarousel.cs:314-315)
// Moving the cursor onto a set or group header only moves the cursor (header slides 25 left, cyan gradient). Enter activates it.

// Left/Right (Carousel.cs:726-783)
traverseSetSelection(dir) {
  if (kbd.carouselItem && currentSelection.carouselItem !== kbd.carouselItem) { this.activate(kbd.carouselItem); return; } // commit the cursor first
  this.traverseSelection(dir, it => this.checkValidForSetSelection(it));  // sets; in standalone mode, difficulties
}
traverseSelection(dir, pred) {
  if (!items?.length) return;
  let i, orig;
  if (kbd.index == null) i = orig = dir > 0 ? items.length - 1 : 0;
  else { i = orig = kbd.index; if (dir < 0) while (i > 0 && !pred(items[i])) i--; } // walk back to own header first
  for (;;) {
    i = (i + dir + items.length) % items.length;
    if (i === orig) break;
    const it = items[i];
    if (!it.isExpanded && pred(it)) { this.activate(it); return; }   // skips the currently expanded header; wraps
  }
}
// Shift+Left/Right: traverseSelection(dir, it => it.model instanceof GroupDefinition)
// Shift+Enter (Carousel.cs:513-540): if the cursor is a group → activate it; else activate the nearest group header above the cursor.

// PageUp/Down (Carousel.cs:642-689): step = max(1, floor(materialisedPanels.length / 2)) visible items; no activation
//   setKeyboardSelection(target); scrollToSelection(); playTraversalSound(); at the list ends, go to the first/last visible item (only if different).
// Home/End (Carousel.cs:695-710): first/last visible item, same effects.
// Enter/Space: activate(kbd.carouselItem)
```
Mouse wheel and drag do not change the selection.

### 6.5 Random (`BeatmapCarousel.cs:975-1174`)
Default algorithm: **RandomPermutation** (`OsuConfigManager.cs:56`).
```ts
nextRandom(): boolean {
  if (!items?.length) return false;
  const before = this.currentSelectionItem, beatmapBefore = before?.model as GroupedBeatmap | undefined;
  if (beatmapBefore) { randomHistory.push(beatmapBefore); visited.add(beatmapBefore.beatmap); }
  const ok = grouping.beatmapSetsGroupedTogether ? this.nextRandomSet() : this.nextRandomBeatmap();
  if (!ok) { if (beatmapBefore) randomHistory.pop(); return false; }
  this.scheduleAfterChildren(() => {                 // once the new selection item resolves
    if (before && this.currentSelectionItem) this.playSpinSample(Math.ceil(Math.abs(before.y - this.currentSelectionItem.y) / 72));
  });
  return true;
}
// Candidates are restricted to the expanded group if one exists. Permutation: choose uniformly among not-yet-visited sets/beatmaps.
// When none remain, reset visited for the candidates and exclude the current one. Sets → selectRecommendedDifficultyForBeatmapSet.
playSpinSample(distance) {
  const ch = spin.getChannel(); ch.frequency = 1 + clamp(distance / 200, 0, 1); ch.play();  // random-spin.wav, playbackRate
  selectRandom.play();                                                                       // select-random.wav
}
previousRandom(): pop the history until a beatmap is found (prefer the same group). Play spin with distance 0 if there is no current item, then requestSelection.
```
Random goes through `RequestSelection`, not `Activate`, so **no activation sound or flash** plays. The first random on entering song select (no previous selection) plays no spin.
Note the scroll is animated (a standard ScrollToSelection), so a long jump plays as a fast exponential glide.

---

## 7. Empty state: `NoResultsPlaceholder` (`osu/osu.Game/Screens/Select/NoResultsPlaceholder.cs`)

Placed in the same padded container as the carousel (`SongSelect.cs:271-295`): RelSize Both, centred, `StartHidden`.
- A vertical FillFlow, width **300**, centred:
  - Container 50×50, margin 10, TopCentre, holding a **GhostIcon**
  - "No matching beatmaps" in **TorusAlternate Regular 32** (Title)
  - A `LinkFlowContainer`, padding top 20, α0, `AlwaysPresent`
  
  (`:57-104`)
- Ghost bob loop (`:110-114`): `icon.loop(t => t.moveToY(-10, 2000, InOutSine).then().moveToY(0, 2000, InOutSine))`.
- GhostIcon is a shader SDF (`res/Shaders/sh_Ghost.fs`) in unit coordinates: body = min(circle centre (0.5, 0.375) r 0.375, box centre (0.5, 0.75) half-size 0.375). Eyes are subtracted:
  two circles at (0.5 ± 0.125, 0.375), r 0.0625. The bottom zigzag threshold is `0.875 + (cos((x − t)·8π)·0.5 + 0.5)·0.125·sin(πx)`, with outer corners rounded r 0.0625.
  `t = (time/2000) % 1` gives a 4-spike moving hem. It is white. Port it with Canvas2D or an SVG path rebuilt per frame.
- PopIn `fadeIn(600, OutQuint)` + `updateText()`. PopOut `fadeOut(200, OutQuint)` (`:117-127`).
- `updateText()`, run on each criteria change (`:129-200`): `scaleTo(0.9).scaleTo(1, 1000, OutQuint)` (bounce); `textFlow.fadeInFromZero(800, OutQuint)`; rebuild the text.
  Bullet = FontAwesome Circle at scale 0.3, padding T24 R15. Links use `Light2 #a6c8d9`.
  - No beatmaps at all: "Consider running the "First-run setup" to download or import some beatmaps!"
  - Otherwise: "No beatmaps match your filter criteria!" + blank line, then optional bullets:
    - "Try clearing your current search criteria." (when text exists)
    - "Try removing the {min:N1} - {max|∞} star difficulty filter." (when the star filter is active)
    - "Try enabling automatic conversion!" (non-osu! ruleset and converts off)
  - Always (when search text exists): "Try searching online for "{text}"."
- SongSelect side (`SongSelect.cs:921-953`). Shown when `MatchedBeatmapsCount == 0`. On the hidden→shown transition it calls
  `music.DuckMomentarily(400, {DuckVolumeTo 1, DuckCutoffTo 500 Hz, DuckDuration 250, RestoreDuration 2000})`, and the right gradient background
  does `resizeWidthTo(3, 1000, OutPow10)`. When results return: placeholder hidden and gradient `resizeWidthTo(1, 400, OutPow10)`.
  The status text is "{n} match(es)" (`osu/osu.Game/Localisation/SongSelectStrings.cs:285`).

---

## 8. Shared sub-components used by panels

### 8.1 StarRatingDisplay, Small (`osu/osu.Game/Beatmaps/Drawables/StarRatingDisplay.cs`)
- An AutoSize CircularContainer (pill) with a background Box and a Grid: [Star icon 8×8 | 3 gap | text, min width 25]. Margin H7 (Small) (`:82-147`).
- Text: Torus **Bold 14.4**, fixed-width, spacing −1.4, margin bottom 1.5, **no shadow**. Format `floor2(sr).toFixed(2)`, or "-" if negative
  (`osu/osu.Game/Utils/FormatUtils.cs:46-53`).
- Colours: background `forStarDifficulty(displayed)`. Star icon and text use `forStarDifficultyText(displayed)`: `<6.5` → black α0.75; `<9` → Orange1 `#ffd966`;
  otherwise a sample of the text spectrum (`osu/osu.Game/Graphics/OsuColour.cs:67-76`).
- Animation (`:154-173`): `transformBindableTo(displayedStars, new, min(1000, 100 + 80·|new−old|), OutQuint)`. A new value interrupts and continues from the
  current displayed value. Panels read `DisplayedDifficultyColour` every frame to drive their accent.
- `ForStarDifficulty` (`OsuColour.cs:33-48, 62`) rounds SR to 2 dp (away from zero), then linearly interpolates (linear RGB) between stops:
  `0.1 #aaaaaa | 0.1 #4290fb | 1.25 #4fc0ff | 2.0 #4fffd5 | 2.5 #7cff4f | 3.3 #f6f05c | 4.2 #ff8068 | 4.9 #ff4e6f | 5.8 #c645b8 | 6.7 #6563de | 7.7 #18158e | 9.0 #000000 | 10.0 #000000`.
  Below 0.1 it returns `#aaaaaa`; above the last stop it returns black. Text spectrum: `9.0 #f6f05c | 9.9 #ff8068 | 10.6 #ff4e6f | 11.5 #c645b8 | 12.4 #6563de` (`:50-57`).

### 8.2 StarCounter (`osu/osu.Game/Graphics/UserInterface/StarCounter.cs`)
10 stars of FontAwesome Star, 20×20 each, spacing 4 (the panel draws them at scale 0.4). Star i shows scale `i+1 ≤ v ? 1 : clamp(v − i, 0, 1)`,
mapped to `lerp(0.4, 1, s)`. Per-star delay is `max(rising ? i − cur : min(cur,10) − 1 − i, 0)·80` ms. Each star runs `FadeTo(s, 100)` and `Icon.ScaleTo(s, 1000, OutElasticHalf)`.
On load it replays from 0 (`:80-158`).

### 8.3 BeatmapSetOnlineStatusPill (`osu/osu.Game/Beatmaps/Drawables/BeatmapSetOnlineStatusPill.cs`)
A CircularContainer (AutoSize) with a Box and text. Text is Torus **Bold**, size 12 here, padding H4 B1, **UPPERCASE** status name.
Status None → hidden (α0). The panels pass `Animated = false`, so there are no transitions (`:70-140`). Text colour: Background3 `#394246`, or Background1 `#5c6970` for Graveyard.
Background (`OsuColour.cs:155-187`):
Ranked/Approved `#b3ff66`, Loved `#ff66ab`, Qualified `#66ccff`, Pending `#ffd966`, WIP `#ff9966`, Graveyard `#000000`,
LocallyModified = Color4.OrangeRed `#ff4500` ("LOCAL"), None = RosyBrown `#bc8f8f`.
Labels: "RANKED", "APPROVED", "LOVED", "QUALIFIED", "WIP", "PENDING", "GRAVEYARD", "LOCAL", "UNKNOWN".

### 8.4 TrianglesV2 (`osu/osu.Game/Graphics/Backgrounds/TrianglesV2.cs`), summary
Outlined equilateral triangles that rise upward. Edge length `100·ScaleAdjust`, height ratio 0.866. Count `clamp(DrawWidth·0.02·SpawnRatio, 1, …)`.
Each triangle has a speed multiplier ~N(0.5, 0.16), minimum 0.1. Speed is `Velocity·50·max(0.5, mult)` units per second, upward. A triangle respawns at the bottom once fully above the top.
Initial Y is random. Outline thickness is relative (`Thickness`). The drawable's colour, including gradients, tints them (`:20-189`). Full spec is in the backgrounds spec.

---

## 9. Layout context (from SongSelect, for placing the carousel)

- The carousel sits in the grid's right column. Width = `Relative 0.5`, min **500**, max `700 + max(0, W/H − 2)·300` (`SongSelect.cs:416-423`).
- Its container is padded top `FilterControl.HEIGHT_FROM_SCREEN_TOP + 5 = 136` (`141 − 10 + 5`) and bottom 5. The screen's `mainContent` adds bottom padding `ScreenFooter.HEIGHT = 50`
  (`SongSelect.cs:191, 271-278`; `osu/osu.Game/Screens/Select/FilterControl.cs:39-41`; `osu/osu.Game/Screens/Footer/ScreenFooter.cs:42`).
  `BleedTop = 136` and `BleedBottom = 55` (`SongSelect.cs:283-284`), so the bleed-extended viewport is exactly the full screen height.
- Behind the carousel is `rightGradientBackground`, `GradientHorizontal(black@0, black@0.5)`, anchored TopRight (`SongSelect.cs:264-270`). The FilterControl draws on top of the carousel's upper area.
- Carousel masking is **off** (`Carousel.cs:318`). Panels draw into the bleed areas behind the filter control and footer.

---

## 10. Online-only pieces to stub visually

- Update button (`PanelUpdateBeatmapButton`): always hidden offline.
- Local rank badge: hidden (no scores).
- `DifficultyRecommender`: offline it returns null, so the set's easiest difficulty is chosen.
- Grouping by Favourites, MyMaps, RankAchieved, Collections: produces empty or trivial groups without user data.
- Context-menu entries Details, Copy link, Collections: render as items and no-op.
- SpreadDisplay "scope to set" (eye) works offline. It is a SongSelect feature: set `FilterCriteria.SelectedBeatmapSet`.

---

## 11. Open questions / uncertainties

1. `BeatSyncedContainer` behaviour when no track is playing, and how `DEFAULT` timing interacts with `EarlyActivationMilliseconds`. This spec cites the source, but the cross-component beat-sync spec should own it.
2. The pooled first-use fade-in (§4.3). Strictly, fresh pool instances skip the 400 ms fade and reused ones fade from 0. A port with a pool of 100 per type reproduces this naturally.
3. Font weights: Torus "SemiBold" maps to `Torus-SemiBold.bin`. TorusAlternate Bold for set titles uses `Torus-Alternate-Bold.fnt`, which is a `.fnt` file, not `.bin`. Confirm the loader handles both.
4. The scrollbar colour multiply quirk (§3.8) and the dead activation-sound debounce (§6.3) are source bugs, reproduced deliberately.
5. Real-client screenshots were not consulted for this spec. Every value comes from source at master 2026-10-19.
