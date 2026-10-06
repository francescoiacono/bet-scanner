declare module "numeric" {
  interface OptimisationResult {
    solution: number[];
    f: number;
    gradient: number[];
    iterations: number;
    message: string;
  }
  const numeric: {
    uncmin(objective: (point: number[]) => number, initial: number[], tolerance: number,
      gradient: (point: number[]) => number[], maximumIterations: number,
      callback?: (iteration: number, point: number[], value: number, gradient: number[]) => boolean): OptimisationResult;
  };
  export default numeric;
}
