// snarkjs ships no types; this is the one call NØNOS makes.
declare module 'snarkjs' {
  export const groth16: {
    fullProve(input: Record<string, unknown>, wasm: string, zkey: string, logger?: unknown, wtnsOptions?: object, proverOptions?: { singleThread?: boolean }): Promise<{ proof: any; publicSignals: string[] }>;
  };
}
