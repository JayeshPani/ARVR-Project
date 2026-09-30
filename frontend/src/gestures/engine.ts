/** Pure, timestamp-driven interpretation: no camera, DOM or scene dependencies. */
export interface Point { x: number; y: number; z?: number }
export interface Hand { landmarks: Point[]; handedness?: string }
export type Action = "rotate" | "move" | "zoom";
export interface GestureFrame {
  mode: "idle" | "arming" | Action;
  action?: Action;
  progress: number;
  points: Point[];
  started: boolean;
  dx: number;
  dy: number;
  ratio: number;
  /** Index fingertip of a pointing hand, emitted even while idle so in-scene
   * UI has something to hover with. `points` is empty when idle. */
  cursor?: Point;
}
export const GESTURE = {
  pinchOn: 0.40, pinchOff: 0.55, smoothMs: 80, gapMs: 150,
  hold: { rotate: 250, move: 350, zoom: 150 }, deadZone: 0.002,
  minZoom: 0.35, maxZoom: 3, maxMatchDistance: 0.25,
  // Zoom-specific tolerances. Holding two pinches steady is the least stable
  // input in the vocabulary, so a committed zoom is defended harder than the
  // one-handed gestures: a looser release threshold, a grace window for
  // dropouts, and a bounded per-frame scale change.
  pinchOffZoom: 0.65, zoomGraceMs: 250, minZoomSpread: 0.08,
  minZoomTrackSpread: 0.05, maxRatioStep: 0.08, ratioDeadZone: 0.01,
};
export function clampZoom(value: number): number { return Math.min(GESTURE.maxZoom, Math.max(GESTURE.minZoom, value)); }
interface Track { id: number; palm: Point; label?: string; pinch: boolean; hand: Hand }
const idle = (): GestureFrame => ({ mode: "idle", progress: 0, points: [], started: false, dx: 0, dy: 0, ratio: 1 });
const mean = (points: Point[]): Point => ({ x: points.reduce((s,p)=>s+p.x,0)/points.length, y: points.reduce((s,p)=>s+p.y,0)/points.length });
const palm = (h: Hand): Point => mean([0,5,9,13,17].map(i=>h.landmarks[i]!));
const midpoint = (h: Hand): Point => mean([h.landmarks[4]!,h.landmarks[8]!]);
function dist(a: Point,b: Point,aspect: number): number { return Math.hypot((a.x-b.x)*aspect,a.y-b.y); }
function openPalm(h: Hand, aspect: number): boolean {
  const p = h.landmarks;
  // Four extended fingers; thumb is deliberately excluded from this classifier.
  return [8,12,16,20].every(t => dist(p[t]!,p[0]!,aspect) > dist(p[t-2]!,p[0]!,aspect)*1.18);
}
/** Index extended with the other three curled - deliberately distinct from
 * open palm (rotate) and pinch (move/zoom), so pointing at in-scene UI can
 * never be mistaken for manipulating the model. */
export function pointingCursor(h: Hand, aspect = 1): Point | null {
  const p = h.landmarks;
  if (p.length !== 21 || !p.every(q => Number.isFinite(q.x) && Number.isFinite(q.y))) return null;
  const extended = (tip: number) => dist(p[tip]!, p[0]!, aspect) > dist(p[tip - 2]!, p[0]!, aspect) * 1.18;
  if (!extended(8) || extended(12) || extended(16) || extended(20)) return null;
  const size = dist(p[0]!, p[9]!, aspect);
  if (size > 1e-5 && dist(p[4]!, p[8]!, aspect) / size < GESTURE.pinchOn) return null;
  return { x: p[8]!.x, y: p[8]!.y };
}
export class GestureEngine {
  private tracks: Track[] = [];
  private nextId = 0;
  private lastTime = -Infinity;
  private key = "";
  private since = 0;
  private active = false;
  private filtered: Point[] = [];
  private applied: Point[] = [];
  private initialSpread = 1;
  private releaseRequired = false;
  private zoomGraceUntil = 0;
  private lastRatio = 1;
  /** True once a gesture is committed (past its hold). Lets the tracker skip a
   * late frame instead of tearing down a gesture the user is mid-way through. */
  get isActive(): boolean { return this.active; }
  cancel(requireRelease = true): void {
    this.key = ""; this.active = false; this.filtered = []; this.applied = [];
    this.releaseRequired = requireRelease; this.tracks = []; this.lastTime = -Infinity;
    this.zoomGraceUntil = 0; this.lastRatio = 1;
  }
  update(hands: Hand[], time: number, aspect = 1): GestureFrame {
    const frame = this.interpret(hands, time, aspect);
    // Only while idle, and only for a single unambiguous hand: a cursor is UI
    // input, and must never compete with a manipulation in progress.
    if (frame.mode !== "idle" || hands.length !== 1) return frame;
    const cursor = pointingCursor(hands[0]!, aspect);
    return cursor ? { ...frame, cursor } : frame;
  }
  private interpret(hands: Hand[], time: number, aspect: number): GestureFrame {
    if (!Number.isFinite(time) || time <= this.lastTime) return idle();
    const dt = time-this.lastTime;
    if (dt > GESTURE.gapMs) { this.key=""; this.active=false; this.filtered=[]; this.tracks=[]; }
    this.lastTime=time;
    hands = hands.filter(h=>h.landmarks.length===21 && h.landmarks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).slice(0,2);
    if (!hands.length) { this.cancel(false); this.lastTime=time; return idle(); }
    const previous = this.tracks;
    const used = new Set<number>();
    let ambiguous = false;
    const zooming = this.key.startsWith("zoom");
    // A pinch that is already holding a zoom gets a looser release threshold:
    // fingers drift open slightly as the hands travel, and at 0.55 that read
    // as "let go" and killed the gesture.
    const release = zooming ? GESTURE.pinchOffZoom : GESTURE.pinchOff;
    const tracks = hands.map(hand => {
      const centre=palm(hand);
      const candidates = previous.map(t=>({t,d:dist(centre,t.palm,aspect),score:dist(centre,t.palm,aspect)+(t.label!==hand.handedness?0.015:0)}))
        .filter(c=>c.d<GESTURE.maxMatchDistance).sort((a,b)=>a.score-b.score);
      if (candidates.length>1 && Math.abs(candidates[0]!.score-candidates[1]!.score)<0.035) ambiguous=true;
      const match=candidates[0]?.t;
      if (match && used.has(match.id)) ambiguous=true;
      if (match) used.add(match.id);
      const size=dist(hand.landmarks[0]!,hand.landmarks[9]!,aspect);
      const ratio=size>1e-5?dist(hand.landmarks[4]!,hand.landmarks[8]!,aspect)/size:Infinity;
      return { id: match?.id??this.nextId++, palm:centre,label:hand.handedness,
        pinch:ratio<(match?.pinch?release:GESTURE.pinchOn),hand };
    }).sort((a,b)=>a.id-b.id);
    this.tracks=tracks;
    // Identity confusion is only dangerous for gestures that read a single
    // hand's displacement. A committed zoom reads |p0 - p1|, which is
    // invariant to the two tracks swapping - and hands converging is exactly
    // the zoom-out motion, so cancelling there made zoom-out nearly unusable.
    if (ambiguous && !(this.active && zooming)) { this.cancel(true); return idle(); }
    const pinches=tracks.filter(t=>t.pinch);
    if (this.releaseRequired) {
      if (!pinches.length) this.releaseRequired=false;
      this.key=""; this.active=false; return idle();
    }
    let action: Action|undefined;
    let chosen: Track[]=[];
    if(pinches.length===2) { action="zoom"; chosen=pinches; }
    else if(pinches.length===1) { action="move"; chosen=pinches; }
    else { const open=tracks.filter(t=>openPalm(t.hand,aspect)); if(open.length===1) { action="rotate"; chosen=open; } }
    // Losing one pinch used to cancel outright AND demand a full two-hand
    // release before retrying, which is why zoom "rarely triggered": a single
    // dropped frame ended the attempt. Hold the gesture across a brief gap
    // instead. The cancel still happens past the window, preserving the
    // original point of it - a zoom must never decay into a move and fling
    // the model.
    if(zooming && action!=="zoom") {
      if(!this.zoomGraceUntil) this.zoomGraceUntil=time+GESTURE.zoomGraceMs;
      if(time<=this.zoomGraceUntil) {
        return this.active
          ? { mode:"zoom",action:"zoom",progress:1,points:this.filtered,started:false,dx:0,dy:0,ratio:this.lastRatio }
          : {...idle(),mode:"arming",action:"zoom",progress:Math.min(1,(time-this.since)/GESTURE.hold.zoom),points:this.filtered};
      }
      this.cancel(true); return idle();
    }
    this.zoomGraceUntil=0;
    if(!action) { this.key=""; this.active=false; return idle(); }
    const points=chosen.map(t=>action==="rotate"?t.palm:midpoint(t.hand));
    const key=action+":"+chosen.map(t=>t.id).join(",");
    if(key!==this.key) { this.key=key; this.since=time; this.active=false; this.filtered=points; this.applied=points; }
    const progress=Math.min(1,(time-this.since)/GESTURE.hold[action]);
    if(progress<1) return {...idle(),mode:"arming",action,progress,points};
    if(!this.active) {
      const spread=action==="zoom"?dist(points[0]!,points[1]!,aspect):1;
      // The old `Math.max(spread, 0.04)` floor was the jump: starting with the
      // hands close made the baseline larger than the spread it is divided by,
      // so the very first ratio landed well below 1 and the model snapped.
      // Refusing to arm until the hands are measurably apart is recoverable;
      // a snap is not.
      if(action==="zoom" && spread<GESTURE.minZoomSpread) return {...idle(),mode:"arming",action,progress:1,points};
      this.active=true; this.filtered=points; this.applied=points;
      this.initialSpread=spread; this.lastRatio=1;
      return {...idle(),mode:action,action,progress:1,points,started:true};
    }
    const alpha=1-Math.exp(-Math.min(dt,150)/GESTURE.smoothMs);
    this.filtered=points.map((p,i)=>({x:this.filtered[i]!.x+alpha*(p.x-this.filtered[i]!.x),y:this.filtered[i]!.y+alpha*(p.y-this.filtered[i]!.y)}));
    let dx=this.filtered[0]!.x-this.applied[0]!.x,dy=this.filtered[0]!.y-this.applied[0]!.y;
    if(Math.hypot(dx,dy)<GESTURE.deadZone) { dx=0;dy=0; } else this.applied=this.filtered.map(p=>({...p}));
    let ratio=1;
    if(action==="zoom") {
      const spread=dist(this.filtered[0]!,this.filtered[1]!,aspect);
      if(spread<GESTURE.minZoomTrackSpread) ratio=this.lastRatio; // hands overlapping: hold rather than collapse to the clamp floor
      else {
        const raw=spread/this.initialSpread;
        // Bound how far one frame can move the scale. `raw` is absolute, so a
        // single mis-placed landmark would otherwise snap the model across
        // most of its range in one frame.
        ratio=Math.min(this.lastRatio*(1+GESTURE.maxRatioStep),Math.max(this.lastRatio*(1-GESTURE.maxRatioStep),raw));
        if(Math.abs(ratio-this.lastRatio)<GESTURE.ratioDeadZone) ratio=this.lastRatio;
      }
      this.lastRatio=ratio;
    }
    return { mode:action,action,progress:1,points:this.filtered,started:false,dx,dy,ratio };
  }
}
