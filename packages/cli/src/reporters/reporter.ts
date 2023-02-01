export interface Reporter {
  onBegin(): void;
  onEnd(): void;
  onCheckEnd(checkResult: any): void;
}
