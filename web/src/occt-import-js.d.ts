// occt-import-js ships no types; `cad-step.ts` describes the result it reads.
declare module 'occt-import-js' {
  const factory: (options?: { locateFile?: (name: string) => string }) => Promise<unknown>;
  export default factory;
}
