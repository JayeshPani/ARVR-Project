import type { Scenario, ScenarioFrame } from "../case/types";

/**
 * Scrubs through a scenario's five precomputed states. All geometry and
 * volumes are generated offline (data-processing/); this only selects and
 * displays them — no on-device simulation (plan section E).
 */
export class ScenarioController {
  private scenario: Scenario;
  private stepIndex = 0;

  constructor(scenario: Scenario) {
    this.scenario = scenario;
  }

  setScenario(scenario: Scenario): void {
    this.scenario = scenario;
    this.stepIndex = 0;
  }

  get currentFrame(): ScenarioFrame {
    return this.scenario.frames[this.stepIndex];
  }

  get explanation(): string {
    return this.scenario.explanation;
  }

  goToStep(step: number): ScenarioFrame {
    if (step < 0 || step > 4) {
      throw new RangeError(`Scenario step ${step} out of range [0, 4]`);
    }
    this.stepIndex = step;
    return this.currentFrame;
  }

  allVolumeSeries(regionId: string): number[] {
    return this.scenario.frames.map((frame) => frame.volumesMl[regionId] ?? 0);
  }
}
