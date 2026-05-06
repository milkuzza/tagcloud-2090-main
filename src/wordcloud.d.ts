declare module 'wordcloud' {
  export type WordCloudColorFn = (
    word: string,
    weight: number,
    fontSize: number,
    distance: number,
    theta: number
  ) => string;

  export type WordCloudFontWeightFn = (
    word: string,
    weight: number,
    fontSize: number,
    extraData?: unknown
  ) => string;

  export type WordCloudOptions = {
    list: Array<[string, number]>;
    weightFactor?: number | ((count: number) => number);
    color?: string | WordCloudColorFn;
    fontWeight?: string | WordCloudFontWeightFn;
    backgroundColor?: string;
    fontFamily?: string;
    rotateRatio?: number;
    rotationSteps?: number;
    minRotation?: number;
    maxRotation?: number;
    shrinkToFit?: boolean;
    minSize?: number;
    gridSize?: number;
    drawOutOfBound?: boolean;
    clearCanvas?: boolean;
    shuffle?: boolean;
  };

  function WordCloud(canvas: HTMLCanvasElement, options: WordCloudOptions): void;
  export default WordCloud;
}
