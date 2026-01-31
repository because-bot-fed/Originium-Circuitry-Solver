/**
 * Puzzle Solver for Originium Circuitry
 * Uses backtracking search with constraint propagation
 */

/**
 * Generate all valid placements for a specific shape on the grid
 */
function generatePlacementsForShape(shapeId, gridRows, gridCols, blockedSet) {
    const placements = [];
    const shape = SHAPE_LIBRARY[shapeId];

    for (let rotIdx = 0; rotIdx < shape.rotations.length; rotIdx++) {
        const rotation = shape.rotations[rotIdx];
        const bounds = getShapeBounds(rotation);

        // Try placing at each valid position
        for (let startRow = 0; startRow <= gridRows - bounds.height; startRow++) {
            for (let startCol = 0; startCol <= gridCols - bounds.width; startCol++) {
                // Calculate actual cell positions
                const cells = rotation.map(([r, c]) => [startRow + r, startCol + c]);

                // Check if any cell overlaps with blocked cells
                const overlapsBlocked = cells.some(([r, c]) => blockedSet.has(`${r},${c}`));

                if (!overlapsBlocked) {
                    placements.push({
                        shapeId,
                        rotationIndex: rotIdx,
                        cells,
                        cellSet: new Set(cells.map(([r, c]) => `${r},${c}`))
                    });
                }
            }
        }
    }

    return placements;
}

/**
 * Generate all valid placements for enabled shapes on the grid
 */
function generateAllPlacements(gridRows, gridCols, blockedCells, enabledShapes) {
    const placements = [];
    const blockedSet = new Set(blockedCells.map(([r, c]) => `${r},${c}`));

    for (const shapeId of enabledShapes) {
        const shapePlacements = generatePlacementsForShape(shapeId, gridRows, gridCols, blockedSet);
        placements.push(...shapePlacements);
    }

    return placements;
}

/**
 * Calculate row and column counts for a set of cells
 */
function calculateCounts(cells, gridRows, gridCols) {
    const rowCounts = Array(gridRows).fill(0);
    const colCounts = Array(gridCols).fill(0);

    for (const [r, c] of cells) {
        rowCounts[r]++;
        colCounts[c]++;
    }

    return { rowCounts, colCounts };
}

/**
 * Check if current counts match requirements exactly
 */
function countsMatch(rowCounts, colCounts, rowReqs, colReqs, color) {
    for (let r = 0; r < rowCounts.length; r++) {
        if (rowCounts[r] !== rowReqs[r][color]) return false;
    }
    for (let c = 0; c < colCounts.length; c++) {
        if (colCounts[c] !== colReqs[c][color]) return false;
    }
    return true;
}

/**
 * Check if current counts exceed requirements (pruning condition)
 */
function countsExceed(rowCounts, colCounts, rowReqs, colReqs, color) {
    for (let r = 0; r < rowCounts.length; r++) {
        if (rowCounts[r] > rowReqs[r][color]) return true;
    }
    for (let c = 0; c < colCounts.length; c++) {
        if (colCounts[c] > colReqs[c][color]) return true;
    }
    return false;
}

/**
 * Solve for a single color using backtracking
 */
function solveForColor(color, placements, gridRows, gridCols, rowReqs, colReqs, forbiddenCells) {
    const solutions = [];
    const forbiddenSet = new Set(forbiddenCells.map(([r, c]) => `${r},${c}`));

    // Filter placements that don't overlap forbidden cells
    const validPlacements = placements.filter(p => {
        return !p.cells.some(([r, c]) => forbiddenSet.has(`${r},${c}`));
    });

    // Sort placements by position for consistent ordering
    validPlacements.sort((a, b) => {
        const aMin = Math.min(...a.cells.map(([r, c]) => r * 100 + c));
        const bMin = Math.min(...b.cells.map(([r, c]) => r * 100 + c));
        return aMin - bMin;
    });

    const rowCounts = Array(gridRows).fill(0);
    const colCounts = Array(gridCols).fill(0);
    const usedCells = new Set();
    const currentPlacements = [];

    function backtrack(startIdx) {
        // Check if we've satisfied requirements
        if (countsMatch(rowCounts, colCounts, rowReqs, colReqs, color)) {
            solutions.push({
                placements: [...currentPlacements],
                cells: Array.from(usedCells).map(s => s.split(',').map(Number))
            });
            // Continue searching for more solutions (don't return)
            // But limit total solutions to prevent explosion
            if (solutions.length >= 100) return;
        }

        // Pruning: if we've exceeded any requirement, stop
        if (countsExceed(rowCounts, colCounts, rowReqs, colReqs, color)) {
            return;
        }

        // Try each remaining placement
        for (let i = startIdx; i < validPlacements.length; i++) {
            const placement = validPlacements[i];

            // Check if this placement overlaps with used cells
            const overlaps = placement.cells.some(([r, c]) => usedCells.has(`${r},${c}`));
            if (overlaps) continue;

            // Add this placement
            currentPlacements.push(placement);
            for (const [r, c] of placement.cells) {
                usedCells.add(`${r},${c}`);
                rowCounts[r]++;
                colCounts[c]++;
            }

            // Recurse
            backtrack(i + 1);

            // Remove this placement (backtrack)
            currentPlacements.pop();
            for (const [r, c] of placement.cells) {
                usedCells.delete(`${r},${c}`);
                rowCounts[r]--;
                colCounts[c]--;
            }

            // Early exit if we have enough solutions
            if (solutions.length >= 100) return;
        }
    }

    backtrack(0);
    return solutions;
}

/**
 * Main solver function
 */
function runSolver(gridRows, gridCols, gridState, rowReqs, colReqs, enabledShapes) {
    // Get blocked cells
    const blockedCells = [];
    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            if (gridState[r][c] === 'blocked') {
                blockedCells.push([r, c]);
            }
        }
    }

    // Check if any requirements exist
    const hasGreenReq = rowReqs.some(r => r.green > 0) || colReqs.some(c => c.green > 0);
    const hasBlueReq = rowReqs.some(r => r.blue > 0) || colReqs.some(c => c.blue > 0);

    if (!hasGreenReq && !hasBlueReq) {
        return { success: false, message: 'No requirements specified' };
    }

    // Generate all valid shape placements
    const allPlacements = generateAllPlacements(gridRows, gridCols, blockedCells, enabledShapes);

    if (allPlacements.length === 0) {
        return { success: false, message: 'No valid shape placements possible' };
    }

    const solutions = [];

    // Solve for green first (or skip if no green requirements)
    let greenSolutions = [];
    if (hasGreenReq) {
        greenSolutions = solveForColor('green', allPlacements, gridRows, gridCols, rowReqs, colReqs, blockedCells);
        if (greenSolutions.length === 0) {
            return { success: false, message: 'No valid green configuration found' };
        }
    } else {
        // No green requirements - one "empty" solution
        greenSolutions = [{ placements: [], cells: [] }];
    }

    // For each green solution, solve for blue
    for (const greenSol of greenSolutions) {
        const greenCellsSet = new Set(greenSol.cells.map(([r, c]) => `${r},${c}`));
        const forbiddenForBlue = [...blockedCells, ...greenSol.cells];

        if (hasBlueReq) {
            const blueSolutions = solveForColor('blue', allPlacements, gridRows, gridCols, rowReqs, colReqs, forbiddenForBlue);

            for (const blueSol of blueSolutions) {
                solutions.push({
                    green: greenSol.cells,
                    blue: blueSol.cells,
                    greenPlacements: greenSol.placements,
                    bluePlacements: blueSol.placements
                });

                // Limit total solutions
                if (solutions.length >= 50) break;
            }
        } else {
            // No blue requirements
            solutions.push({
                green: greenSol.cells,
                blue: [],
                greenPlacements: greenSol.placements,
                bluePlacements: []
            });
        }

        if (solutions.length >= 50) break;
    }

    if (solutions.length === 0) {
        return { success: false, message: 'No valid solution found' };
    }

    return { success: true, solutions };
}

/**
 * Validate a solution (for debugging)
 */
function validateSolution(solution, gridRows, gridCols, rowReqs, colReqs) {
    const greenCounts = calculateCounts(solution.green, gridRows, gridCols);
    const blueCounts = calculateCounts(solution.blue, gridRows, gridCols);

    const errors = [];

    // Check green row requirements
    for (let r = 0; r < gridRows; r++) {
        if (greenCounts.rowCounts[r] !== rowReqs[r].green) {
            errors.push(`Row ${r} green: expected ${rowReqs[r].green}, got ${greenCounts.rowCounts[r]}`);
        }
    }

    // Check green column requirements
    for (let c = 0; c < gridCols; c++) {
        if (greenCounts.colCounts[c] !== colReqs[c].green) {
            errors.push(`Col ${c} green: expected ${colReqs[c].green}, got ${greenCounts.colCounts[c]}`);
        }
    }

    // Check blue row requirements
    for (let r = 0; r < gridRows; r++) {
        if (blueCounts.rowCounts[r] !== rowReqs[r].blue) {
            errors.push(`Row ${r} blue: expected ${rowReqs[r].blue}, got ${blueCounts.rowCounts[r]}`);
        }
    }

    // Check blue column requirements
    for (let c = 0; c < gridCols; c++) {
        if (blueCounts.colCounts[c] !== colReqs[c].blue) {
            errors.push(`Col ${c} blue: expected ${colReqs[c].blue}, got ${blueCounts.colCounts[c]}`);
        }
    }

    // Check for overlaps
    const greenSet = new Set(solution.green.map(([r, c]) => `${r},${c}`));
    const blueSet = new Set(solution.blue.map(([r, c]) => `${r},${c}`));

    for (const cell of greenSet) {
        if (blueSet.has(cell)) {
            errors.push(`Overlap at ${cell}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Solver for "Fit All Pieces" mode
 * Places exactly the specified count of each shape without caring about row/column requirements
 */
function runFitAllPiecesSolver(gridRows, gridCols, blockedCells, shapeCounts) {
    const blockedSet = new Set(blockedCells.map(([r, c]) => `${r},${c}`));
    const solutions = [];

    // Build a list of shape instances to place (respecting counts)
    const shapeInstances = [];
    for (const [shapeId, count] of Object.entries(shapeCounts)) {
        for (let i = 0; i < count; i++) {
            shapeInstances.push(shapeId);
        }
    }

    if (shapeInstances.length === 0) {
        return { success: false, message: 'No shapes to place' };
    }

    // Pre-generate all placements for each shape type
    const placementsByShape = {};
    for (const shapeId of Object.keys(shapeCounts)) {
        placementsByShape[shapeId] = generatePlacementsForShape(shapeId, gridRows, gridCols, blockedSet);
    }

    // Check if any shape has no valid placements
    for (const [shapeId, placements] of Object.entries(placementsByShape)) {
        if (placements.length === 0) {
            return { success: false, message: `No valid placements for shape: ${SHAPE_LIBRARY[shapeId].name}` };
        }
    }

    const usedCells = new Set();
    const currentPlacements = [];

    function backtrack(instanceIdx) {
        if (instanceIdx >= shapeInstances.length) {
            // All shapes placed successfully
            const allCells = [];
            currentPlacements.forEach(p => {
                p.cells.forEach(cell => allCells.push(cell));
            });

            solutions.push({
                green: allCells,
                blue: [],
                greenPlacements: [...currentPlacements],
                bluePlacements: []
            });

            // Limit solutions
            return solutions.length >= 50;
        }

        const shapeId = shapeInstances[instanceIdx];
        const placements = placementsByShape[shapeId];

        for (const placement of placements) {
            // Check if this placement overlaps with used cells
            const overlaps = placement.cells.some(([r, c]) => usedCells.has(`${r},${c}`));
            if (overlaps) continue;

            // Place the shape
            currentPlacements.push(placement);
            for (const [r, c] of placement.cells) {
                usedCells.add(`${r},${c}`);
            }

            // Recurse
            const shouldStop = backtrack(instanceIdx + 1);
            if (shouldStop) return true;

            // Backtrack
            currentPlacements.pop();
            for (const [r, c] of placement.cells) {
                usedCells.delete(`${r},${c}`);
            }
        }

        return false;
    }

    backtrack(0);

    if (solutions.length === 0) {
        return { success: false, message: 'Could not fit all pieces on the grid' };
    }

    return { success: true, solutions };
}

/**
 * Solver with exact shape counts and row/column requirements
 */
function runSolverWithShapeCounts(gridRows, gridCols, gridState, rowReqs, colReqs, shapeCounts) {
    // Get blocked cells
    const blockedCells = [];
    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            if (gridState[r][c] === 'blocked') {
                blockedCells.push([r, c]);
            }
        }
    }

    // Check if any requirements exist
    const hasGreenReq = rowReqs.some(r => r.green > 0) || colReqs.some(c => c.green > 0);
    const hasBlueReq = rowReqs.some(r => r.blue > 0) || colReqs.some(c => c.blue > 0);

    if (!hasGreenReq && !hasBlueReq) {
        return { success: false, message: 'No requirements specified' };
    }

    const blockedSet = new Set(blockedCells.map(([r, c]) => `${r},${c}`));

    // Build list of shape instances
    const shapeInstances = [];
    for (const [shapeId, count] of Object.entries(shapeCounts)) {
        for (let i = 0; i < count; i++) {
            shapeInstances.push(shapeId);
        }
    }

    // Pre-generate placements for each shape
    const placementsByShape = {};
    for (const shapeId of Object.keys(shapeCounts)) {
        placementsByShape[shapeId] = generatePlacementsForShape(shapeId, gridRows, gridCols, blockedSet);
    }

    const solutions = [];

    // Solve for green first
    let greenSolutions = [];
    if (hasGreenReq) {
        greenSolutions = solveForColorWithCounts('green', shapeInstances, placementsByShape, gridRows, gridCols, rowReqs, colReqs, blockedCells);
        if (greenSolutions.length === 0) {
            return { success: false, message: 'No valid green configuration found with selected shapes' };
        }
    } else {
        greenSolutions = [{ placements: [], cells: [], usedShapeIndices: new Set() }];
    }

    // For each green solution, solve for blue with remaining shapes
    for (const greenSol of greenSolutions) {
        const forbiddenForBlue = [...blockedCells, ...greenSol.cells];
        const remainingShapeInstances = shapeInstances.filter((_, idx) => !greenSol.usedShapeIndices.has(idx));

        if (hasBlueReq) {
            if (remainingShapeInstances.length === 0) {
                // No shapes left for blue but blue requirements exist
                continue;
            }

            const blueSolutions = solveForColorWithCountsSimple('blue', remainingShapeInstances, placementsByShape, gridRows, gridCols, rowReqs, colReqs, forbiddenForBlue);

            for (const blueSol of blueSolutions) {
                solutions.push({
                    green: greenSol.cells,
                    blue: blueSol.cells,
                    greenPlacements: greenSol.placements,
                    bluePlacements: blueSol.placements
                });

                if (solutions.length >= 50) break;
            }
        } else {
            solutions.push({
                green: greenSol.cells,
                blue: [],
                greenPlacements: greenSol.placements,
                bluePlacements: []
            });
        }

        if (solutions.length >= 50) break;
    }

    if (solutions.length === 0) {
        return { success: false, message: 'No valid solution found with selected shape counts' };
    }

    return { success: true, solutions };
}

/**
 * Solve for a color using exact shape instances (tracks which indices are used)
 */
function solveForColorWithCounts(color, shapeInstances, placementsByShape, gridRows, gridCols, rowReqs, colReqs, forbiddenCells) {
    const solutions = [];
    const forbiddenSet = new Set(forbiddenCells.map(([r, c]) => `${r},${c}`));

    const rowCounts = Array(gridRows).fill(0);
    const colCounts = Array(gridCols).fill(0);
    const usedCells = new Set();
    const currentPlacements = [];
    const usedShapeIndices = new Set();

    function backtrack(instanceIdx) {
        // Check if we've satisfied requirements
        if (countsMatch(rowCounts, colCounts, rowReqs, colReqs, color)) {
            solutions.push({
                placements: [...currentPlacements],
                cells: Array.from(usedCells).map(s => s.split(',').map(Number)),
                usedShapeIndices: new Set(usedShapeIndices)
            });
            if (solutions.length >= 100) return true;
        }

        // Pruning: if we've exceeded any requirement, stop
        if (countsExceed(rowCounts, colCounts, rowReqs, colReqs, color)) {
            return false;
        }

        // Try placing more shapes
        for (let i = instanceIdx; i < shapeInstances.length; i++) {
            const shapeId = shapeInstances[i];
            const placements = placementsByShape[shapeId];

            for (const placement of placements) {
                // Check if overlaps with used or forbidden cells
                const overlaps = placement.cells.some(([r, c]) =>
                    usedCells.has(`${r},${c}`) || forbiddenSet.has(`${r},${c}`)
                );
                if (overlaps) continue;

                // Place the shape
                currentPlacements.push(placement);
                usedShapeIndices.add(i);
                for (const [r, c] of placement.cells) {
                    usedCells.add(`${r},${c}`);
                    rowCounts[r]++;
                    colCounts[c]++;
                }

                // Recurse
                const shouldStop = backtrack(i + 1);
                if (shouldStop) return true;

                // Backtrack
                currentPlacements.pop();
                usedShapeIndices.delete(i);
                for (const [r, c] of placement.cells) {
                    usedCells.delete(`${r},${c}`);
                    rowCounts[r]--;
                    colCounts[c]--;
                }
            }
        }

        return false;
    }

    backtrack(0);
    return solutions;
}

/**
 * Simplified version for blue (doesn't need to track indices for further use)
 */
function solveForColorWithCountsSimple(color, shapeInstances, placementsByShape, gridRows, gridCols, rowReqs, colReqs, forbiddenCells) {
    const solutions = [];
    const forbiddenSet = new Set(forbiddenCells.map(([r, c]) => `${r},${c}`));

    const rowCounts = Array(gridRows).fill(0);
    const colCounts = Array(gridCols).fill(0);
    const usedCells = new Set();
    const currentPlacements = [];

    function backtrack(instanceIdx) {
        // Check if we've satisfied requirements
        if (countsMatch(rowCounts, colCounts, rowReqs, colReqs, color)) {
            solutions.push({
                placements: [...currentPlacements],
                cells: Array.from(usedCells).map(s => s.split(',').map(Number))
            });
            if (solutions.length >= 100) return true;
        }

        // Pruning
        if (countsExceed(rowCounts, colCounts, rowReqs, colReqs, color)) {
            return false;
        }

        for (let i = instanceIdx; i < shapeInstances.length; i++) {
            const shapeId = shapeInstances[i];
            const placements = placementsByShape[shapeId];

            for (const placement of placements) {
                const overlaps = placement.cells.some(([r, c]) =>
                    usedCells.has(`${r},${c}`) || forbiddenSet.has(`${r},${c}`)
                );
                if (overlaps) continue;

                currentPlacements.push(placement);
                for (const [r, c] of placement.cells) {
                    usedCells.add(`${r},${c}`);
                    rowCounts[r]++;
                    colCounts[c]++;
                }

                const shouldStop = backtrack(i + 1);
                if (shouldStop) return true;

                currentPlacements.pop();
                for (const [r, c] of placement.cells) {
                    usedCells.delete(`${r},${c}`);
                    rowCounts[r]--;
                    colCounts[c]--;
                }
            }
        }

        return false;
    }

    backtrack(0);
    return solutions;
}
