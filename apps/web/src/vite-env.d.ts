/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module '*.module.scss' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module '*.module.less' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module '@fontsource/material-icons-round';

declare module 'chroma-js' {
  const chroma: {
    (color: string | chroma.Color): chroma.Color;
    mix(color1: string | chroma.Color, color2: string | chroma.Color, ratio?: number): chroma.Color;
    valid(color?: string | chroma.Color | null): boolean;
    scale(colors?: Array<string | chroma.Color>): chroma.Scale;
  };
  namespace chroma {
    interface Color {
      hex(): string;
      rgb(): number[];
      rgba(): [number, number, number, number];
      hsl(): number[];
      luminance(): number;
      contrast(color2: string | Color): number;
      saturate(amount?: number): Color;
      desaturate(amount?: number): Color;
      darken(amount?: number): Color;
      brighten(amount?: number): Color;
      alpha(value: number): Color;
      css(): string;
      name(): string;
    }
    interface Scale {
      (value: number): Color;
      domain(values: number[]): Scale;
      mode(mode: string): Scale;
      colors(count: number): string[];
    }
  }
  export = chroma;
}
