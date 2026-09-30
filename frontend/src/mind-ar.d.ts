/** Minimal types for the pinned MindAR 1.2.5 integration and its managed camera adapter. */
declare module "mind-ar/dist/mindar-image-three.prod.js" {
  import type { Scene, PerspectiveCamera, WebGLRenderer, Group } from "three";

  export interface MindArAnchor {
    group: Group;
    onTargetFound?: () => void;
    onTargetLost?: () => void;
  }

  export interface MindARThreeOptions {
    container: HTMLElement;
    imageTargetSrc: string;
    uiLoading?: "no";
    uiScanning?: "no";
    uiError?: "no";
  }

  export class MindARThree {
    constructor(options: MindARThreeOptions);
    scene: Scene;
    camera: PerspectiveCamera;
    renderer: WebGLRenderer;
    /** The <video> element MindAR created for the camera feed - shared
     * with the shared gesture worker so it doesn't request getUserMedia twice. */
    video: HTMLVideoElement;
    _startVideo(): Promise<void>;
    ui: { hideLoading():void; hideScanning():void; hideCompatibility():void };
    addAnchor(targetIndex: number): MindArAnchor;
    start(): Promise<void>;
    stop(): Promise<void>;
  }
}
