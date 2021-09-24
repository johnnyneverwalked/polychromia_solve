import {Component, OnInit} from '@angular/core';
import {levels} from "src/levels"
import {reduce, cloneDeep, flattenDeep} from "lodash";
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
        "RED", "BLUE", "YELLOW", "PURPLE", "GREEN", "ORANGE", "BLACK", "WHITE"
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
        this.defineSatConstraints(this.level);
        this.solveBoard();
    }

    contsructLevelGraph(level: any) {
        const V: any = {};
        const E = new Set<string>();
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
        this.level.graph = <Graph>{V, E};
    }

    defineSatConstraints(level: any) {
        this.solver = new Logic.Solver()
        const graph: Graph = level.graph;

        this._edgeClauses(graph);
        this._terminalCellClauses(graph);
        this._inversionCellClauses(graph);
        this._normalCellClauses(graph);
    }

    solveBoard() {
        this.solution = this.solver.solve();
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

    private _edgeClauses(graph: Graph) {
        for (const edge of graph.E.values()) {
            // at most one color per edge
            this.solver.require(Logic.atMostOne(this.colors.map(c => `${edge},${c}`)));
            // every cell connected by this edge must either be terminal or have another edge of the same/derived/negative color
            const edgeCells = this._nodesFromEdge(edge);
            this.colors.forEach(c => {
                edgeCells.forEach(cell => {
                    const neighbouringEdges = graph.V[cell]?.neighbours
                        .map(n => this._edgeFromNodes(cell, n))
                        .filter(e => e !== edge);

                    switch (graph.V[cell]?.type) {
                        case this.types.START:
                        case this.types.END:
                            break;
                        case this.types.NEGATIVE:
                            this.solver.require(Logic.implies(
                                `${edge},${c}`,
                                Logic.or(neighbouringEdges.map(e => `${e},${this._find_negative_color(c)}`))
                            ));
                            break;
                        default:
                            this.solver.require(Logic.implies(
                                `${edge},${c}`,
                                Logic.or(neighbouringEdges.map(e => `${e},${c}`))
                            ));

                    }
                })
            })
        }
    }

    private _normalCellClauses(graph: Graph) {

        for (const [cell, cellData] of Object.entries(graph.V)) {
            if (!!cellData.type) {
                continue;
            }
            const neighbouringEdges = cellData.neighbours.map(n => this._edgeFromNodes(cell, n))

            // forbid empty cells to become invert cells
            this.solver.forbid(`${cell},INVERT`);
            // one color per empty cell
            this.solver.require(Logic.exactlyOne(this.colors.map(c => `${cell},${c}`)));

            this.colors.forEach(c => {
                // at least 2 edges of the color of the cell
                this.solver.require(Logic.equiv(
                    `${cell},${c}`,
                    Logic.and(combinations(neighbouringEdges, neighbouringEdges.length - 1, neighbouringEdges.length - 1)
                        .map(tuple => Logic.or(tuple.map(e => `${e},${c}`)))
                )));
            })
        }
    }

    private _inversionCellClauses(graph: Graph) {
        for (const [cell, cellData] of Object.entries(graph.V)) {
            if (cellData.type !== this.types.NEGATIVE) {
                continue;
            }
            const neighbouringEdges = cellData.neighbours.map(n => this._edgeFromNodes(cell, n))
            // cell must be of invert type
            this.solver.require(`${cell},INVERT`);
            // forbid cell to have color
            this.solver.forbid(this.colors.map(c => `${cell},${c}`));
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
        }
    }

    private _terminalCellClauses(graph: Graph) {
        for (const [cell, cellData] of Object.entries(graph.V)) {
            if (![this.types.END, this.types.START].includes(cellData.type)) {
                continue;
            }

            const neighbouringEdges = cellData.neighbours.map(n => this._edgeFromNodes(cell, n))

            // forbid cell to become inverted
            this.solver.forbid(`${cell},INVERT`);
            // assert known cell color
            this.solver.require(`${cell},${cellData.color}`);
            // forbid cell to be any other color
            this.solver.forbid(this.colors.filter(c => c !== cellData.color).map(c => `${cell},${c}`));

            // exactly one edge of cell color
            this.solver.require(Logic.exactlyOne(neighbouringEdges.map(e => `${e},${cellData.color}`)))
            // forbid every other edge to have any color
            neighbouringEdges.forEach(e => {
                this.solver.forbid(Logic.equiv(
                    `${e},${cellData.color}`,
                    Logic.or(
                        flattenDeep(neighbouringEdges
                            .filter(e2 => e2 !== e)
                            .map(e2 => this.colors
                                .map(c => `${e2},${c}`)))
                    )
                ))
            })
        }
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

interface Graph {
    V: Record<string, {
        type?: number,
        color?: string,
        neighbours?: string[]
    }>;
    E: Set<string>;
}
