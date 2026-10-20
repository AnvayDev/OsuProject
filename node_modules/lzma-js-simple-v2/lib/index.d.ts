type Mode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

declare function compress(
  str: string | ArrayLike<number> | Uint8Array | ArrayBufferLike,
  mode?: Mode,
  on_finish?: (result: number[], error: any) => void,
  on_progress?: (percent: number) => void
): number[];

declare function decompress(
  byte_arr: ArrayLike<number> | Uint8Array | ArrayBufferLike,
  on_finish?: (result: string | number[], error: any) => void,
  on_progress?: (percent: number) => void
): string | number[];

export { compress, decompress };
