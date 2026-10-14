/** Never display a stale pose as though it were still anchored in the world. */
export function worldTrackingState(input: {
  placed:boolean; sameWorld:boolean; stopped:boolean; qualityGood:boolean;
  anchorTracking:boolean; frameAgeMs:number; hidden:boolean;
}):{placed:boolean;visible:boolean;canPlace:boolean} {
  const placed=input.placed&&input.sameWorld&&!input.stopped;
  const fresh=!input.hidden&&input.frameAgeMs<=250;
  return {placed,visible:placed&&fresh&&input.qualityGood&&input.anchorTracking,
    canPlace:fresh&&input.qualityGood};
}
