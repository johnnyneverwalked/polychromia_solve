import {Solver} from "./src/app/core/classes/Solver";
import {Generator} from "./src/app/core/classes/Generator";
import {readFileSync, writeFileSync} from "fs";
import {chunk, cloneDeep} from "lodash";

const generator = new Generator();
const solver = new Solver();
const options = {
    grid: {width: 4, height: 4},
    inversions: {min: 0, max: 1},
    terminals: {min: 2, max: 3}
}
const generateLimit = 5;

let levels;
const levelIds = [];
const path = `levels_${options.grid.width}x${options.grid.height}.json`;

try {
    levels = JSON.parse(readFileSync(path).toString("utf8"));
    levelIds.push(
        ...levels.solvable.map(lvl => lvl.shorthand),
        ...levels.unsolvable.map(lvl => lvl.shorthand),
    )
} catch (e) {
    console.log(`File not found, generating file for ${options.grid.width}x${options.grid.height} levels...`);

    levels = {solvable: [], unsolvable: []}
    writeFileSync(path, JSON.stringify(levels, null, 4));
}

console.log(`STARTING ${options.grid.width}x${options.grid.height} LEVEL GENERATION WITH LIMIT: ${generateLimit}`);

let solution
let level
const start = Date.now();
for (let lvlGenerated = 0; lvlGenerated < generateLimit; lvlGenerated++) {
    do {
        level = generator.generateLevel(options);

        if (levelIds.includes(level.shorthand)) {
            console.log(`duplicate Level: ${level.shorthand}`);
            continue;
        } else {
            levelIds.push(level.shorthand);
        }

        solver.level = cloneDeep(level);
        solution = solver.solveBoard();

        if (!solution) {
            // console.log("UNSOLVABLE");
            levels.unsolvable.push(level);
        } else {
            // chunk(level.shorthand.split("."), generator.grid.width)
            //     .forEach(row => console.log(row.join(".")));
        }

    } while (!solution)
    levels.solvable.push(level);
    console.log(`ADDED ${lvlGenerated + 1} / ${generateLimit}`, Date.now() - start + "ms");
}

writeFileSync(path, JSON.stringify(levels, null, 4));

console.log(`Added ${levels.solvable.length} solvable and ${levels.unsolvable.length} unsolvable levels in ${((Date.now() - start) / 1000).toFixed(2)}s`);
