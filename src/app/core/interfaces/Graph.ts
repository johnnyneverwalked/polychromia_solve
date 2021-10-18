export interface Graph {
    V: Record<string, {
        cellKey: string,
        coords: number[],
        type?: number,
        color?: string,
        neighbours?: string[]
    }>;
    E: Set<string>;
}
