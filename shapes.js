/**
 * Shape Definitions for Originium Circuitry Solver
 *
 * Each shape is defined as an array of [row, col] offsets from origin (0,0).
 * Rotations are generated automatically in 90° increments.
 */

const SHAPE_DEFINITIONS = {
    // 2x2 square
    "square-4": {
        name: "2x2 Square",
        cells: [[0, 0], [0, 1], [1, 0], [1, 1]]
    },

    // 3-block line (horizontal base)
    "line-3": {
        name: "3-Block Line",
        cells: [[0, 0], [0, 1], [0, 2]]
    },

    // 3-block L shape
    "L-3": {
        name: "3-Block L",
        cells: [[0, 0], [1, 0], [1, 1]]
    },

    // 3-block L shape (mirrored)
    "L-3-mirror": {
        name: "3-Block L (Mirror)",
        cells: [[0, 1], [1, 0], [1, 1]]
    },

    // 4-block L shape
    "L-4": {
        name: "4-Block L",
        cells: [[0, 0], [1, 0], [2, 0], [2, 1]]
    },

    // 4-block L shape (mirrored)
    "L-4-mirror": {
        name: "4-Block L (Mirror)",
        cells: [[0, 1], [1, 1], [2, 0], [2, 1]]
    },

    // 4-block T shape
    "T-4": {
        name: "4-Block T",
        cells: [[0, 0], [0, 1], [0, 2], [1, 1]]
    },

    // 6-block T shape with extra block on top-left
    // X . .
    // X X X
    // . X .
    // . X .
    "T-6": {
        name: "6-Block T",
        cells: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 1], [3, 1]]
    },

    // 6-block T shape mirrored (extra block on top-right)
    // . . X
    // X X X
    // . X .
    // . X .
    "T-6-mirror": {
        name: "6-Block T (Mirror)",
        cells: [[0, 2], [1, 0], [1, 1], [1, 2], [2, 1], [3, 1]]
    },

    // 5-block cross (plus sign)
    "cross-5": {
        name: "5-Block Cross",
        cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]]
    },

    // 6-block J shape (3x3 with center missing and 2 contiguous corner blocks missing)
    "J-6": {
        name: "6-Block J",
        cells: [[0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]]
    },

    // 6-block J shape (mirrored)
    "J-6-mirror": {
        name: "6-Block J (Mirror)",
        cells: [[0, 0], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]]
    }
};

/**
 * Rotate a shape 90 degrees clockwise
 * Transform: (row, col) -> (col, -row)
 * Then normalize to start from (0,0)
 */
function rotateShape90(cells) {
    // Rotate: new position = (col, -row)
    const rotated = cells.map(([r, c]) => [c, -r]);

    // Normalize to positive coordinates starting from (0,0)
    const minRow = Math.min(...rotated.map(([r, c]) => r));
    const minCol = Math.min(...rotated.map(([r, c]) => c));

    return rotated.map(([r, c]) => [r - minRow, c - minCol]);
}

/**
 * Generate all unique rotations of a shape (0°, 90°, 180°, 270°)
 */
function getAllRotations(cells) {
    const rotations = [cells];
    let current = cells;

    for (let i = 0; i < 3; i++) {
        current = rotateShape90(current);

        // Check if this rotation is unique (not already in list)
        const isUnique = !rotations.some(existing =>
            shapesEqual(existing, current)
        );

        if (isUnique) {
            rotations.push(current);
        }
    }

    return rotations;
}

/**
 * Check if two shapes are equal (same cells, possibly different order)
 */
function shapesEqual(shape1, shape2) {
    if (shape1.length !== shape2.length) return false;

    const set1 = new Set(shape1.map(([r, c]) => `${r},${c}`));
    const set2 = new Set(shape2.map(([r, c]) => `${r},${c}`));

    if (set1.size !== set2.size) return false;

    for (const key of set1) {
        if (!set2.has(key)) return false;
    }

    return true;
}

/**
 * Get bounding box dimensions of a shape
 */
function getShapeBounds(cells) {
    const rows = cells.map(([r, c]) => r);
    const cols = cells.map(([r, c]) => c);

    return {
        minRow: Math.min(...rows),
        maxRow: Math.max(...rows),
        minCol: Math.min(...cols),
        maxCol: Math.max(...cols),
        height: Math.max(...rows) - Math.min(...rows) + 1,
        width: Math.max(...cols) - Math.min(...cols) + 1
    };
}

/**
 * Build complete shape library with all rotations
 */
function buildShapeLibrary() {
    const library = {};

    for (const [id, definition] of Object.entries(SHAPE_DEFINITIONS)) {
        const rotations = getAllRotations(definition.cells);
        library[id] = {
            name: definition.name,
            baseShape: definition.cells,
            rotations: rotations,
            cellCount: definition.cells.length
        };
    }

    return library;
}

// Export for use in solver
const SHAPE_LIBRARY = buildShapeLibrary();
