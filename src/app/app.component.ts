import {Component, OnInit} from '@angular/core';
import {levels} from "src/levels"
// import * as levels from "levels_4x4.json";
import {reduce, cloneDeep} from "lodash";
import {Solver} from "./core/classes/Solver";
import {colors, dirs, types} from "./core/interfaces/Generics";

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
    title = 'polychromia-gen';
    // @ts-ignore
    public readonly levels = levels;
    // public readonly levels = levels.solvable;
    public readonly dirs = dirs;
    public readonly types = types;


    public level: any = {};
    public solver: Solver;

    public highlightedCell: string;

    constructor() {
        this.solver = new Solver();
    }


    ngOnInit() {
        this.nextLevel();
    }

    nextLevel(idx: number|string = 0) {
        let level: any = cloneDeep(this.levels[idx] ?? this.levels[0]);
        level.index = Number(idx) ?? 0;
        this.solver.level = level;
        this.level = this.solver.level;
        this.solveBoard();
    }

    solveBoard() {
        const solution = this.solver.solveBoard();

        if (!solution) {
            console.log("UNSOLVABLE");
            return;
        }
        const vars = solution.getTrueVars() || [];
        const cells = vars
            .filter(v => v.startsWith("CELL"))
            .map((v: string) => v.replace("CELL", "").split(","))
        const edges = vars.filter(v => v.startsWith("e_"));

        this.level.solution = reduce(cells, (sol, cell) => {
            sol.colors[`${cell[0]},${cell[1]}`] = cell[2].replace("WHITE", "GRAY");

            return sol;
        }, {colors: {}});

        this.level.solution.edges = reduce(edges, (sol, e) => {
            const key = e.split(",");
            const color = key.pop();
            if (colors.includes(color)) {
                sol[key.join(",")] = color.replace("WHITE", "GRAY");
            }

            return sol;
        }, {});

        this.level.solution.roots = reduce(edges.filter(edge => edge.includes("ROOT")), (sol, e) => {
            const key = e.split(",ROOT_");
            const root = key.pop();

            sol[key] = root;
            return sol;

        }, {});
    }
}


