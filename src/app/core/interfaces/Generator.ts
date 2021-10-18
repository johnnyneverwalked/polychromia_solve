export interface IGeneratorOptions {
    grid: Dimensions;
    terminals: Bounds;
    inversions: Bounds;
}

export interface Dimensions {
    width: number;
    height: number;
}

export interface Bounds {
    min: number;
    max: number;
}
