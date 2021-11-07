import {Graph} from "../interfaces/Graph";
import {reduce, cloneDeep, flattenDeep, uniq} from "lodash";
import * as Logic from "logic-solver"
// @ts-ignore necessary for the ts-node generator script
const combinations = require("combinations");
import {colors, dirs, types} from "../interfaces/Generics";

export class Solver {
    private _level: any;
    protected solverInstance: any;
    public solution: any;

    constructor() {
    }

    get level() {
        return cloneDeep(this._level);
    }

    set level(level: any) {
        const size = level.grid_size.split(",") ?? ","
        level.grid_size = [Number(size[0].trim().split("(")[1]), Number(size[1].trim().split(")")[0])]

        level.cells = reduce(level.cells ?? [], (cells: Record<string, any>, cell: any) => {
            const pos = cell.position.split(",") ?? ","
            cell.position = [Number(pos[0].trim().split("(")[1]), Number(pos[1].trim().split(")")[0])]
            cells[cell.position.join(",")] = cell;
            return cells
        }, {})

        this._level = level

        this.contsructLevelGraph(this._level);
        this.defineSatConstraints(this._level);
    }

    contsructLevelGraph(level: any) {
        const V: any = {};
        const E = new Set<string>();
        for (let j = 0; j < level.grid_size[1]; j++) {
            for (let i = 0; i < level.grid_size[0]; i++) {
                const v: string = `CELL${i},${j}`;
                V[v] = {
                    cellKey: v,
                    color: this._level.cells[v.replace("CELL", "")]?.color,
                    type: this._level.cells[v.replace("CELL", "")]?.type,
                    coords: [i, j],
                    neighbours: [...dirs.LR, ...dirs.TB]
                        .filter(dir => this._isValidNeighbour([i + dir[0], j + dir[1]]))
                        .map(dir => `CELL${i + dir[0]},${j + dir[1]}`)
                };
                V[v].neighbours.forEach(n => E.add(this._edgeFromNodes(v, n)))
            }
        }
        this._level.graph = <Graph>{V, E};
    }

    defineSatConstraints(level: any) {
        delete this.solverInstance;
        this.solverInstance = new Logic.Solver()
        const graph: Graph = level.graph;

        this._terminalCellClauses(graph);
        this._inversionCellClauses(graph);
        this._normalCellClauses(graph);
        this._edgeClauses(graph);
    }

    solveBoard() {
        this.solution = this.solverInstance.solve();
        let cycle = false;
        let vars = [];
        let checkedNodes = [];
        let visited = [];
        let cycleDetectionLimiter = 0;
        do {
            vars = this.solution?.getTrueVars() || [];
            checkedNodes = []
            for (const v of vars) {
                if (v.startsWith("e_")) {
                    continue;
                }

                const node = v.split(",").slice(0, -1).join(",");
                const rootsToCheck = uniq(vars.filter(e => e.includes("ROOT") && e.includes(node)).map(e => e.split("ROOT_").pop()));
                for (const root of rootsToCheck) {
                    visited = [];
                    cycle = this._detectCycle(this.level.graph, node, null, root, visited, checkedNodes.filter(cn => cn.root === root).map(cn => cn.n), vars);
                    if (cycle) {
                        const relevantEdges = uniq(combinations(visited, 2, 2)
                            .map(nodes => `${this._edgeFromNodes(nodes[0], nodes[1])},ROOT_${root}`))
                            .filter(edge => vars.includes(edge));
                        if (relevantEdges.length) {
                            this.solution = this.solverInstance.solveAssuming(Logic.or(relevantEdges.map(edge => Logic.not(edge))));
                        }
                        break;
                    }
                    checkedNodes.push(...visited.map(n => ({n, root})));
                }
                if (cycle) {
                    break;
                }
            }
        } while (cycle && cycleDetectionLimiter++ < 100)
        if (cycle) {
            return null;
        }

        return this.solution;
    }

    private _edgeClauses(graph: Graph) {

        const roots = Object.values(graph.V)
            .filter(data => data.type === types.START)
            .map(data => `ROOT_${data.cellKey}`)

        for (const edge of graph.E.values()) {
            // at most one color per edge
            this.solverInstance.require(Logic.exactlyOne(...colors.map(c => `${edge},${c}`), `${edge},null`));
            this.solverInstance.forbid(`${edge},BLACK`)

            // if colored one starting point must be connected to the edge (track the whole line)
            this.solverInstance.require(Logic.equiv(
                Logic.not(`${edge},null`),
                Logic.exactlyOne(roots.map(root => `${edge},${root}`)))
            );

            // every cell connected by this edge must either be terminal or have another edge of the same/derived/negative color
            const edgeCells = this._nodesFromEdge(edge);
            colors.forEach(c => {
                edgeCells.forEach(cell => {
                    const neighbouringEdges = graph.V[cell]?.neighbours
                        .map(n => this._edgeFromNodes(cell, n))
                        .filter(e => e !== edge);

                    switch (graph.V[cell]?.type) {
                        case types.START:
                        case types.END:
                            break;
                        case types.NEGATIVE:
                            this.solverInstance.require(Logic.implies(
                                `${edge},${c}`,
                                Logic.or(neighbouringEdges.map(e => `${e},${this._find_negative_color(c)}`))
                            ));

                            roots.forEach(root => this.solverInstance.require(Logic.implies(
                                Logic.and(`${edge},${root}`, `${edge},${c}`),
                                Logic.exactlyOne(neighbouringEdges.map(e => Logic.and(`${e},${root}`, `${e},${this._find_negative_color(c)}`)))
                            )))
                            break;
                        default:

                            const components = this._find_color_components(c);
                            const edgeColorBasedOnCell = [];

                            colors.forEach(c2 => {
                                edgeColorBasedOnCell.push(Logic.implies(
                                    `${cell},${c2}`,
                                    Logic.or(neighbouringEdges.map(e => {
                                        const derived = this._find_derived_color(c, c2);

                                        const componentClauses = components.map(cmp => Logic.and(
                                            `${e},${cmp}`,
                                            Logic.or(flattenDeep(components
                                                .filter(cmp2 => cmp2 !== cmp)
                                                .map(cmp2 => neighbouringEdges
                                                    .filter(e2 => e2 !== e)
                                                    .map(e2 => `${e2},${cmp2}`))
                                            ))
                                        ))
                                        return Logic.or([...componentClauses, `${e},${derived}`]);
                                    }))
                                ))
                            })
                            this.solverInstance.require(Logic.implies(
                                `${edge},${c}`,
                                Logic.and(...edgeColorBasedOnCell)
                            ));

                            roots.forEach(root => this.solverInstance.require(Logic.implies(
                                Logic.and(`${edge},${root}`, `${edge},${c}`),
                                Logic.exactlyOne(neighbouringEdges.map(e => Logic.and(
                                    `${e},${root}`,
                                    Logic.or(
                                        Logic.and(...colors.map(c2 => Logic.implies(`${cell},${c2}`, `${e},${this._find_derived_color(c, c2)}`))),
                                        ...components.map(cmp => `${e},${cmp}`)
                                    )
                                )))
                            )));

                    }
                })

                this.solverInstance.require(Logic.implies(
                    `${edge},${c}`,
                    Logic.or(edgeCells.map(cell => Logic.exactlyOne(
                        `${cell},${c}`,
                        `${cell},INVERT`,
                        ...this._find_color_components(c).map(cmp => `${cell},${cmp}`)
                    )))
                ));
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
            this.solverInstance.forbid(`${cell},INVERT`);
            // one color per empty cell
            this.solverInstance.require(Logic.exactlyOne(colors.map(c => `${cell},${c}`)));

            colors.forEach(c => {
                // at least 2 edges of the color of the cell
                this.solverInstance.require(Logic.equiv(
                    `${cell},${c}`,
                    Logic.and(combinations(neighbouringEdges, neighbouringEdges.length - 1, neighbouringEdges.length - 1)
                        .map(tuple => Logic.or(tuple.map(e => `${e},${c}`)))
                    )));
            })

            this._coloredEdgesSetsOfTwo(neighbouringEdges);
        }
    }

    private _inversionCellClauses(graph: Graph) {
        for (const [cell, cellData] of Object.entries(graph.V)) {
            if (cellData.type !== types.NEGATIVE) {
                continue;
            }
            const neighbouringEdges = cellData.neighbours.map(n => this._edgeFromNodes(cell, n))
            // cell must be of invert type
            this.solverInstance.require(`${cell},INVERT`);
            // forbid cell to have color
            this.solverInstance.forbid(colors.map(c => `${cell},${c}`));
            // invert cells need to have a negative color edge for each color edge
            neighbouringEdges.forEach(e => {
                colors.forEach(c => {
                    this.solverInstance.require(Logic.implies(
                        `${e},${c}`,
                        Logic.or(neighbouringEdges
                            .filter(e2 => e2 !== e)
                            .map(e2 => `${e2},${this._find_negative_color(c)}`)
                        )))
                })
            })
            // atleast one edge passes from this cell
            this.solverInstance.require(Logic.or(flattenDeep(colors.map(c => neighbouringEdges.map(e => `${e},${c}`)))));
            this._coloredEdgesSetsOfTwo(neighbouringEdges);
        }
    }

    private _terminalCellClauses(graph: Graph) {

        const roots = Object.values(graph.V)
            .filter(data => data.type === types.START)
            .map(data => `ROOT_${data.cellKey}`)

        for (const [cell, cellData] of Object.entries(graph.V)) {
            if (![types.END, types.START].includes(cellData.type)) {
                continue;
            }

            const neighbouringEdges = cellData.neighbours.map(n => this._edgeFromNodes(cell, n))

            // forbid cell to become inverted
            this.solverInstance.forbid(`${cell},INVERT`);
            // assert known cell color
            this.solverInstance.require(`${cell},${cellData.color}`);
            // forbid cell to be any other color
            this.solverInstance.forbid(colors.filter(c => c !== cellData.color).map(c => `${cell},${c}`));

            // exactly one edge of cell color
            this.solverInstance.require(Logic.exactlyOne(neighbouringEdges.map(e => `${e},${cellData.color}`)))
            neighbouringEdges.forEach(e => {
                // forbid every other edge to have any color
                this.solverInstance.require(Logic.equiv(
                    `${e},${cellData.color}`,
                    Logic.and(neighbouringEdges
                        .filter(e2 => e2 !== e)
                        .map(e2 => `${e2},null`)
                    )
                ))

                if (cellData.type === types.START) {
                    // require the correct edge to have the root
                    this.solverInstance.require(Logic.equiv(
                        `${e},${cellData.color}`,
                        `${e},ROOT_${cell}`
                    ))
                }

                if (cellData.type === types.END) {
                    // neighbour connected to the edge must have same/derived color or be invert cell
                    const neighbour = this._nodesFromEdge(e).find(n => n !== cell);
                    this.solverInstance.require(Logic.implies(
                        `${e},${cellData.color}`,
                        Logic.or(
                            `${neighbour},${cellData.color}`,
                            `${neighbour},INVERT`,
                            ...this._find_color_components(cellData.color)
                                .map(cmp => `${neighbour},${cmp}`)
                        )
                    ))

                    // the connecting edge must have a root (prevents end cells to connect to themselves)
                    this.solverInstance.require(Logic.equiv(
                        `${e},${cellData.color}`,
                        Logic.exactlyOne(roots.map(root => `${e},${root}`))
                    ))

                }
            })
        }
    }

    private _coloredEdgesSetsOfTwo(edges: string[]) {

        // colored edges must be sets of two
        if (edges.length === 3) {
            this.solverInstance.require(Logic.exactlyOne(edges.map(e => `${e},null`)));
        } else if (edges.length === 4) {
            this.solverInstance.require(Logic.or(
                Logic.and(edges.map(e => `-${e},null`)),
                Logic.and(combinations(edges, edges.length - 1, edges.length - 1)
                    .map(tuple => Logic.or(tuple.map(e => `${e},null`))))
            ))
        }
    }

    _isValidNeighbour(v: number[]) {
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

    private _find_color_components(color) {
        switch (color) {
            case "GREEN":
                return ["YELLOW", "BLUE"];
            case "PURPLE":
                return ["BLUE", "RED"];
            case "ORANGE":
                return ["YELLOW", "RED"];
            case "BLACK":
                return colors.slice(0, 7);
        }
        return [];
    }

    _find_negative_color(color) {
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

    private _detectCycle(graph: Graph, node: string, parent: string, root: string, visited: string[], checkedNodes: string[], solvedVars: string[]) {
        if (!graph.V.hasOwnProperty(node)) {
            return false;
        }
        const nodeData = graph.V[node]
        // if node is already visited we have a cycle
        if (visited.includes(node)) {
            return true;
        }
        visited.push(node);

        // parent is already visited so dont check again, check only neighbours with correct edges
        const neighbours = nodeData.neighbours
            .filter(n => n !== parent
                && !checkedNodes.includes(n)
                && solvedVars.includes(`${this._edgeFromNodes(n, node)},ROOT_${root}`));

        for (const n of neighbours) {
            if (this._detectCycle(graph, n, node, root, visited, checkedNodes, solvedVars)) {
                return true;
            }
        }

        // if the path does not contain a cycle remove node from visited
        visited.splice(visited.indexOf(node), 1);
        return false;
    }
}
