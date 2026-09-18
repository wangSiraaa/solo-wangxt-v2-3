declare module 'fft.js' {
  export default class FFT {
    constructor(size: number);
    readonly size: number;
    createComplexArray(): number[];
    /** 输入为长度 size 的纯实数数组，输出复数数组左半部分（配合 completeSpectrum） */
    realTransform(output: number[], input: ArrayLike<number>): void;
    completeSpectrum(spectrum: number[]): void;
    transform(output: number[], input: number[]): void;
    inverseTransform(output: number[], input: number[]): void;
    toComplexArray(input: ArrayLike<number>, storage?: number[]): number[];
    fromComplexArray(complex: number[], storage?: number[]): number[];
  }
}
