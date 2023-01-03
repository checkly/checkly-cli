export interface Reporter {
  onBegin(): void;
  onEnd(): void;
  onCheckBegin(check: any): void;
  onCheckEnd(checkResult: any): void;
}
