import {Component, OnInit} from '@angular/core';
import {levels} from "src/levels"
import {reduce, cloneDeep} from "lodash";
import * as Logic from "logic-solver"
import * as combinations from "combinations";

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
    title = 'polychromia-gen';
    public readonly levels = levels;
    public readonly types = {
        START: 1,
        END: 2,
        NEGATIVE: 3,
    };
    public readonly dirs = {
        LR: [[-1, 0], [1, 0]],
        TB: [[0, -1], [0, 1]],
        TL: [[0, -1], [-1, 0]],
        TR: [[0, -1], [1, 0]],
        BL: [[0, 1], [-1, 0]],
        BR: [[0, 1], [1, 0]],
    };
    public readonly dirAscii = {
        LR: "─",
        TB: "│",
        TL: "┘",
        TR: "└",
        BL: "┐",
        BR: "┌",
    };
    public readonly colors = [
        "RED", "BLUE",
    ];

    public level: any = {};
    public solver: any;
    public solution: any;

    ngOnInit() {
        this.nextLevel();
    }

    nextLevel(idx: number = 0) {
        const level: any = cloneDeep(levels[idx] ?? levels[0]);
        level.index = idx ?? 0;
        const size = level.grid_size.split(",") ?? ","
        level.grid_size = [Number(size[0].trim().split("(")[1]), Number(size[1].trim().split(")")[0])]

        level.cells = reduce(level.cells ?? [], (cells: Record<string, any>, cell: any) => {
            const pos = cell.position.split(",") ?? ","
            cell.position = [Number(pos[0].trim().split("(")[1]), Number(pos[1].trim().split(")")[0])]
            cells[cell.position.join(",")] = cell;
            return cells
        }, {})

        this.level = level

        this.contsructLevelGraph(this.level);
        this.solution = this.defineSatConstraints(this.level);
        this.solveBoard();
    }

    contsructLevelGraph(level: any) {
        const V = {};
        const E = new Set();
        for (let j = 0; j < level.grid_size[1]; j++) {
            for (let i = 0; i < level.grid_size[0]; i++) {
                const v: string = `CELL${i},${j}`;
                V[v] = {
                    color: this.level.cells[v.replace("CELL", "")]?.color,
                    type: this.level.cells[v.replace("CELL", "")]?.type,
                    neighbours: [...this.dirs.LR, ...this.dirs.TB]
                        .filter(dir => this._isValidNeighbour([i + dir[0], j + dir[1]]))
                        .map(dir => `CELL${i + dir[0]},${j + dir[1]}`)
                };
                V[v].neighbours.forEach(n => E.add(this._edgeFromNodes(v, n)))
            }
        }
        this.level.graph = {V, E};
    }

    defineSatConstraints(level: any) {
        this.solver = new Logic.Solver()
        const graph: { V: Record<string, { type: number, color: string, neighbours: string[] }>, E: Set<string> } = level.graph;
        for (let [cell, cellData] of Object.entries(graph.V)) {
            const neighbouringEdges = cellData.neighbours.map(n => this._edgeFromNodes(cell, n));

            if (!isNaN(cellData.type)) {
                // Known type/color of special cells
                this.solver.require(`${cell},${cellData.color || "INVERT"}`);
                this.solver.forbid(this.colors.filter(c => c !== cellData.color).map(c => `${cell},${c}`));

                if ([this.types.START, this.types.END].includes(cellData.type)) {
                    // forbid start/end cells to become invert cells
                    this.solver.forbid(`${cell},INVERT`);

                    // exactly one edge same color
                    this.solver.require(Logic.exactlyOne(
                        neighbouringEdges.map(e => `${e},${cellData.color}`)
                    ));

                    neighbouringEdges.forEach(e => {
                        // forbid terminal edges to have non terminal color
                        this.solver.forbid(this.colors.filter(c => c !== cellData.color).map(c => `${e},${c}`))

                        if (this.types.END !== cellData.type) {
                            // return
                        }

                        const n = this._nodesFromEdge(e).find(node => node !== cell);
                        // edge connected to a correctly colored node for end cells
                        this.solver.require(Logic.equiv(
                            `${e},${cellData.color}`,
                            Logic.exactlyOne(
                                `${n},${cellData.color}`,
                                `${n},INVERT`,
                            )
                        ))
                    })
                    continue;
                }

                // invert cells need to have a negative color edge for each color edge
                neighbouringEdges.forEach(e => {
                    this.colors.forEach(c => {
                        this.solver.require(Logic.equiv(
                            `${e},${c}`,
                            Logic.or(neighbouringEdges
                                .filter(e2 => e2 !== e)
                                .map(e2 => `${e2}${this._find_negative_color(c)}`)
                            )))
                    })
                })

                // forbid invert cells to have a color
                this.solver.forbid(this.colors.map(c => `${cell},${c}`))

            } else {
                // forbid empty cells to become invert cells
                this.solver.forbid(`${cell},INVERT`);

                // one color per empty cell
                this.solver.require(Logic.exactlyOne(this.colors.map(c => `${cell},${c}`)));

                // at least 2 edges of the color of the cell
                this.colors.forEach(c => {
                    let atleastTwo = combinations(neighbouringEdges, neighbouringEdges.length - 1, neighbouringEdges.length - 1);
                    atleastTwo = atleastTwo.map(tuple => Logic.or(tuple.map(e => `${e},${c}`)));

                    let atMostTwo = [];
                    if (neighbouringEdges.length > 2) {
                        atMostTwo = combinations(neighbouringEdges, 3, 3);
                        atMostTwo = atMostTwo.map(tuple => Logic.or(tuple.map(e => `-${e},${c}`)));
                    }


                    this.solver.require(Logic.equiv(`${cell},${c}`, Logic.and(...atleastTwo, ...atMostTwo)))
                })
            }
        }

        for (let edge of graph.E.values()) {
            // at most one color per edge
            this.solver.require(Logic.atMostOne(...this.colors.map(c => `${edge},${c}`)));
        }

        return this.solver.solve();
    }

    solveBoard() {
        if (!this.solution) {
            console.log("UNSOLVABLE");
            return;
        }
        const cells = this.solution.getTrueVars()
            .filter(v => v.startsWith("CELL"))
            .map((v: string) => v.replace("CELL", "").split(","))
        const edges = this.solution.getTrueVars()
            .filter(v => v.startsWith("e_"));

        this.level.solution = reduce(cells, (sol, cell) => {
            sol.colors[`${cell[0]},${cell[1]}`] = cell[2];

            return sol;
        }, {colors: {}});

        this.level.solution.edges = reduce(edges, (sol, e) => {
            const key = e.split(",");
            const color = key.pop();
            sol[key.join(",")] = color;

            return sol;
        }, {});
    }

    private _isValidNeighbour(v: number[]) {
        if (!this.level.grid_size) {
            return false;
        }
        return v[0] > -1
            && v[1] > -1
            && v[0] < this.level.grid_size[0]
            && v[1] < this.level.grid_size[1]
    }

    private _find_derived_color(color, interpolator) {
        if (color === interpolator || interpolator === "WHITE") {
            return color;
        }
        if (color === "WHITE") {
            return interpolator
        }

        switch (color) {
            case "RED":
                switch (interpolator) {
                    case "BLUE":
                        return "PURPLE";
                    case "YELLOW":
                        return "ORANGE";
                }
                break;
            case "BLUE":
                switch (interpolator) {
                    case "RED":
                        return "PURPLE";
                    case "YELLOW":
                        return "GREEN";
                }
                break;
            case "YELLOW":
                switch (interpolator) {
                    case "BLUE":
                        return "GREEN";
                    case "RED":
                        return "ORANGE";
                }
                break;
        }

        return "BLACK"
    }

    private _find_negative_color(color) {
        switch (color) {
            case "RED":
                return "GREEN";
            case "BLUE":
                return "ORANGE";
            case "YELLOW":
                return "PURPLE";
            case "GREEN":
                return "RED";
            case "PURPLE":
                return "YELLOW";
            case "ORANGE":
                return "BLUE";
            case "BLACK":
                return "WHITE";
            case "WHITE":
                return "BLACK";
        }
        return color;
    }

    private _edgeFromNodes(v1: string, v2: string): string {
        return `e_${[v1, v2].sort().join("_")}`
    }

    private _nodesFromEdge(e: string): string[] {
        return e.split("_").splice(1);
    }
}
