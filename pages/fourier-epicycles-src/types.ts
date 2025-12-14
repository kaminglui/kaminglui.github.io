export interface Point {
  x: number;
  y: number;
}

export interface Complex {
  re: number;
  im: number;
}

export interface FourierTerm {
  re: number;
  im: number;
  freq: number;
  amp: number;
  phase: number;
}

export type InputMode = 'DRAW' | 'VIEW' | 'PRESET' | 'UPLOAD';

export interface Preset {
  name: string;
  generate: () => Point[];
}
