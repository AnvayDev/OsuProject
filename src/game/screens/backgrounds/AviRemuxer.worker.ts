// Web addition: runs AviRemuxer off the main thread (remuxing a beatmap video takes long enough to stall the game).

import { remuxAviToMp4 } from './AviRemuxer';

self.onmessage = (e: MessageEvent<Uint8Array>) => {
  const result = remuxAviToMp4(e.data);
  self.postMessage(result, result === null ? [] : [result.data]);
};
