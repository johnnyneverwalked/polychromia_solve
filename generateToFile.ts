const mongo = require("mongodb").MongoClient;
require('dotenv').config({path: require("path").join(__dirname + "/.env")})

import {Solver} from "./src/app/core/classes/Solver";
import {Generator} from "./src/app/core/classes/Generator";
import {cloneDeep} from "lodash";

const generator = new Generator();
const solver = new Solver();

const options = {
    grid: {width: 5, height: 5},
    inversions: {min: 1, max: 2},
    terminals: {min: 2, max: 4}
}
const generateLimit = 300;

const script = async () => {
    const client = await mongo.connect(process.env.DB_URI);
    const levels = client.db("dubai").collection("Levels");

    const levelIds = await levels.distinct("shorthand", {
        grid_size: `(${options.grid.width}, ${options.grid.height})`
    })

    console.log(`STARTING ${options.grid.width}x${options.grid.height} LEVEL GENERATION WITH LIMIT: ${generateLimit}`);
    console.log(`OPTIONS: `, JSON.stringify(options, null, 4));

    let solution
    let level
    const start = Date.now();
    let solvable: number = 0;
    let unsolvable: number = 0;
    for (let lvlGenerated = 0; lvlGenerated < generateLimit; lvlGenerated++) {
        try {
            do {
                level = generator.generateLevel(options);
                if (levelIds.includes(level.shorthand)) {
                    console.log(`duplicate Level: ${level.shorthand}`);
                    continue;
                }

                solver.level = cloneDeep(level);
                solution = solver.solveBoard();

            } while (!solution)

            await levels.insertOne({...level, solvable: true});
            console.log(`ADDED ${lvlGenerated + 1} / ${generateLimit}`, Date.now() - start + "ms");
            solvable++;
        } catch (e) {
            console.log(e);
        }
    }

    console.log(`Added ${solvable} solvable and ${unsolvable} unsolvable levels in ${((Date.now() - start) / 1000).toFixed(2)}s`);
    client.close();

}

script();

