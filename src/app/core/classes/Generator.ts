import {Solver} from "./Solver";
import {Bounds, Dimensions, IGeneratorOptions} from "../interfaces/Generator";
import {colors, dirs, types} from "../interfaces/Generics";

export class Generator {
    private _gridSize: Dimensions;
    private _terminals: Bounds;
    private _inversions: Bounds;

    private _solver: Solver;

    constructor() {
        this._solver = new Solver();
        this._gridSize = {width: 3, height: 3};
        this._terminals = {min: 2, max: 2};
        this._inversions = {min: 0, max: 0};
    }

    generateLevel(options?: Partial<IGeneratorOptions>) {
        this.grid = options?.grid ?? this.grid ?? {};
        this.terminals = options?.terminals ?? this.terminals ?? {};
        this.inversions = options?.inversions ?? this.inversions ?? {};

        const levelInitData = {
            terminals: Math.floor(Math.random() * (this.terminals.max - this.terminals.min + 1) + this.terminals.min),
            inversions: Math.floor(Math.random() * (this.inversions.max - this.inversions.min + 1) + this.inversions.min),
        };

        const level = {
            grid_size: `(${this.grid.width}, ${this.grid.height})`
        }
        const cells: Record<string, { color?: string; position: string; type?: number }> = {}

        // TODO GENERATE LEVEL AND CHECK IF IT IS SOLVABLE

        // Add inversions
        for (let i = 0; i < levelInitData.inversions; i++) {
            let position = [];
            let limit = 0;
            do {
                position = [
                    Math.floor(Math.random() * this._gridSize.width),
                    Math.floor(Math.random() * this._gridSize.height),
                ];
            } while (cells.hasOwnProperty(`${position[0]},${position[1]}`) && limit++ <= 100);

            if (limit <= 100) {
                cells[`${position[0]},${position[1]}`] = {
                    type: types.NEGATIVE,
                    color: "",
                    position: `(${position[0]}, ${position[1]})`
                }
            }
        }

        // Add terminal points
        for (let i = 0; i < levelInitData.terminals; i++) {

            let startColor = colors[Math.floor(Math.random() * 6)];
            let endColor = i
                ? colors[Math.floor(Math.random() * 6)]
                : !!levelInitData.inversions
                    ? [startColor, this._solver._find_negative_color(startColor)][Math.floor(Math.random() * 2)]
                    : startColor;


            for (let type of [types.START, types.END]) {
                let position = [];
                let limit = 0;
                let validPos: boolean;
                do {
                    position = [
                        Math.floor(Math.random() * this._gridSize.width),
                        Math.floor(Math.random() * this._gridSize.height),
                    ];
                    validPos = !cells.hasOwnProperty(`${position[0]},${position[1]}`) && [
                        ...[...dirs.LR, ...dirs.TB]
                            .map(dir => [position[0] + dir[0], position[1] + dir[1]])
                            .filter(cell => this.isInGrid(cell[0], cell[1])),
                        position
                    ].every(cell => this.isPositionValid(cell[0], cell[1], [`${position[0]},${position[1]}`, ...Object.keys(cells)], cells))

                } while (!validPos && limit++ <= 100);


                cells[`${position[0]},${position[1]}`] = {
                    type: type,
                    color: type === types.START ? startColor : endColor,
                    position: `(${position[0]}, ${position[1]})`
                }

                if (limit > 100) {
                    console.log(cells);
                    throw `Could not place terminal cell pair ${i + 1}`;
                }

            }
        }

        let shorthand = "";
        for (let x = 0; x < this._gridSize.width; x++) {
            for (let y = 0; y < this._gridSize.height; y++) {
                if (cells.hasOwnProperty(`${x},${y}`)) {
                    shorthand += cells[`${x},${y}`]?.type + (cells[`${x},${y}`]?.color?.slice(0, 1) || "*")
                } else {
                    shorthand += "[]"
                }
                shorthand += ".";
            }
        }

        return {...level, cells, shorthand};
    }

    set grid(size: Partial<Dimensions>) {
        this._gridSize = {width: size.width || 3, height: size.height || 3};
        this.terminals = {
            min: Math.max(2, Math.floor(Math.sqrt(this._gridSize?.width * this._gridSize?.height) / 2)),
            max: Math.round(Math.sqrt(this._gridSize?.width * this._gridSize?.height)) - 1
        }
    }

    get grid() {
        return this._gridSize;
    }

    set terminals(bounds: Partial<Bounds>) {
        this._terminals = {
            min: bounds.min ?? this._terminals?.min ?? 2,
            max: bounds.max ?? this._terminals?.max ?? 2,
        }

        if (this._terminals.min > this._terminals.max) {
            this._terminals.min = this._terminals.max;
        }
    }

    get terminals() {
        return this._terminals;
    }

    set inversions(bounds: Partial<Bounds>) {
        this._inversions = {
            min: bounds.min ?? this._inversions.min ?? 0,
            max: bounds.max ?? this._inversions.max ?? 0,
        }
        if (this._inversions.min > this._inversions.max) {
            this._inversions.min = this._inversions.max;
        }
    }

    get inversions() {
        return this._inversions;
    }

    private cellPositionType(x: number, y: number): "corner" | "wall" | "middle" {

        if (x === 0 || x === this._gridSize.width - 1) {
            return y === 0 || y === this._gridSize.height - 1 ? "corner" : "wall";
        }
        if (y === 0 || y === this._gridSize.height - 1) {
            return x === 0 || x === this._gridSize.width - 1 ? "corner" : "wall";
        }

        return "middle";
    }

    private isInGrid(x: number, y: number) {
        return x >= 0 && y >= 0 && x < this._gridSize.width && y < this._gridSize.height;
    }

    private isPositionValid(x: number, y: number, cells: string[], cellMap: Record<string, any>) {

        const validNs = [...dirs.LR, ...dirs.TB]
            .map(dir => [x + dir[0], y + dir[1]])
            .filter(cell => cells.includes(`${cell[0]},${cell[1]}`) && cellMap[`${cell[0]},${cell[1]}`]?.type !== types.NEGATIVE);

        switch (this.cellPositionType(x, y)) {
            case "corner":
                return validNs.length < 2
            case "wall":
                return validNs.length < 3
            case "middle":
                return validNs.length < 4
        }

        return true;
    }
}
