// Ported from osu.Game/Graphics/UserInterface/HoverSampleSet.cs

export enum HoverSampleSet {
  Default,
  Button,
  ButtonSidebar,
  TabSelect,
  DialogCancel,
  DialogOk,
  MenuOpen,
}

const resourceNames: Record<HoverSampleSet, string> = {
  [HoverSampleSet.Default]: 'default',
  [HoverSampleSet.Button]: 'button',
  [HoverSampleSet.ButtonSidebar]: 'button-sidebar',
  [HoverSampleSet.TabSelect]: 'tabselect',
  [HoverSampleSet.DialogCancel]: 'dialog-cancel',
  [HoverSampleSet.DialogOk]: 'dialog-ok',
  [HoverSampleSet.MenuOpen]: 'menu-open',
};

export const HoverSampleSetExtensions = {
  getResourceName(value: HoverSampleSet): string {
    return resourceNames[value];
  },
};
