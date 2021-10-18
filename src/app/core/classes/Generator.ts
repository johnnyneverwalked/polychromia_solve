import {Solver} from "./Solver";
import {Bounds, Dimensions, IGeneratorOptions} from "../interfaces/Generator";

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
        this.grid = options?.grid || {};
        this.terminals = options?.terminals || {};
        this.inversions = options?.inversions || {};

        const levelInitData = {
            terminals: Math.random() * (this.terminals.max - this.terminals.min) + this.terminals.min,
            inversions: Math.random() * (this.inversions.max - this.inversions.min) + this.inversions.min,
        }

        // TODO GENERATE LEVEL AND CHECK IF IT IS SOLVABLE
    }

    set grid(size: Partial<Dimensions>) {
        this._gridSize = {width: size.width || 3, height: size.height || 3};
        this.terminals = {
            min: Math.max(2, Math.floor(Math.sqrt(this._gridSize?.width * this._gridSize?.height) / 2)),
            max: Math.round(Math.sqrt(this._gridSize?.width * this._gridSize?.height)) - 1
        }
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
}
