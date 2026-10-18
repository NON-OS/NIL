// snarkjs ships no types; these are the calls NØNOS makes.
declare module 'snarkjs' {
  export const groth16: {
    fullProve(input: Record<string, unknown>, wasm: string, zkey: string, logger?: unknown, wtnsOptions?: object, proverOptions?: { singleThread?: boolean }): Promise<{ proof: any; publicSignals: string[] }>;
    verify(verificationKey: unknown, publicSignals: string[], proof: unknown): Promise<boolean>;
  };
  export const curves: {
    getCurveFromName(name: string, options?: { singleThread?: boolean }): Promise<unknown>;
  };
}
