declare module 'wordcloud' {
  export type WordCloudColorFn = (
    word: string,
    weight: number,
    fontSize: number,
    distance: number,
    theta: number
  ) => string;

  export type WordCloudOptions = {
    list: Array<[string, number]>;
    weightFactor?: number | ((count: number) => number);
    color?: string | WordCloudColorFn;
    backgroundColor?: string;
    fontFamily?: string;
    rotateRatio?: number;
    shrinkToFit?: boolean;
    minSize?: number;
    gridSize?: number;
    drawOutOfBound?: boolean;
    clearCanvas?: boolean;
  };

  function WordCloud(canvas: HTMLCanvasElement, options: WordCloudOptions): void;
  export default WordCloud;
}
