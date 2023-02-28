export interface Reporter {
  onBegin(): void;
  onEnd(): void;
  onCheckEnd(checkResult: any): void;
  onError(err: Error): void,
}
