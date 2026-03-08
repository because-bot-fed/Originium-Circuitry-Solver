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

    // Identify all colors that have at least one requirement
    const colorsWithReqs = [];
    const checkOrder = ['green', 'blue', 'cyan', 'red', 'purple'];
    const allKnownColors = new Set();
    rowReqs.forEach(r => Object.keys(r).forEach(k => allKnownColors.add(k)));

    for (const color of checkOrder) {
        if (allKnownColors.has(color)) {
            const hasReq = rowReqs.some(r => (r[color] || 0) > 0) || colReqs.some(c => (c[color] || 0) > 0);
            if (hasReq) colorsWithReqs.push(color);
        }
    }
    for (const color of allKnownColors) {
        if (!checkOrder.includes(color)) {
            const hasReq = rowReqs.some(r => (r[color] || 0) > 0) || colReqs.some(c => (c[color] || 0) > 0);
            if (hasReq) colorsWithReqs.push(color);
        }
    }

    if (colorsWithReqs.length === 0) {
        return { success: false, message: 'No requirements specified' };
    }

    // Generate all valid shape placements
    const allPlacements = generateAllPlacements(gridRows, gridCols, blockedCells, enabledShapes);

    if (allPlacements.length === 0) {
        return { success: false, message: 'No valid shape placements possible' };
    }

    // Helper to solve colors one by one
    function solveNextColor(colorIdx, currentForbidden) {
        if (colorIdx >= colorsWithReqs.length) {
            return [{ cellsByColor: {}, placementsByColor: {} }];
        }

        const color = colorsWithReqs[colorIdx];
        const colorSolutions = solveForColor(color, allPlacements, gridRows, gridCols, rowReqs, colReqs, currentForbidden);

        const solutions = [];
        for (const subSol of colorSolutions) {
            const nextForbidden = [...currentForbidden, ...subSol.cells];
            const remainingColorSolutions = solveNextColor(colorIdx + 1, nextForbidden);

            for (const restSol of remainingColorSolutions) {
                const combinedCells = { ...restSol.cellsByColor };
                combinedCells[color] = subSol.cells;

                const combinedPlacements = { ...restSol.placementsByColor };
                combinedPlacements[color] = subSol.placements;

                solutions.push({
                    cellsByColor: combinedCells,
                    placementsByColor: combinedPlacements
                });

                if (solutions.length >= 50) break;
            }
            if (solutions.length >= 50) break;
        }

        return solutions;
    }

    const rawSolutions = solveNextColor(0, blockedCells);

    if (rawSolutions.length === 0) {
        return { success: false, message: 'No valid solution found' };
    }

    // Format solutions for consistent output
    const formattedSolutions = rawSolutions.map(sol => {
        const formatted = {
            green: sol.cellsByColor.green || [],
            blue: sol.cellsByColor.blue || [],
            greenPlacements: sol.placementsByColor.green || [],
            bluePlacements: sol.placementsByColor.blue || []
        };
        for (const color in sol.cellsByColor) {
            if (color !== 'green' && color !== 'blue') {
                formatted[color] = sol.cellsByColor[color];
                formatted[color + 'Placements'] = sol.placementsByColor[color];
            }
        }
        return formatted;
    });

    return { success: true, solutions: formattedSolutions };
}

/**
 * Validate a solution (for debugging)
 */
function validateSolution(solution, gridRows, gridCols, rowReqs, colReqs) {
    const errors = [];
    const colorSets = {};

    // Get all colors present in requirements or solution
    const colors = new Set();
    rowReqs.forEach(r => Object.keys(r).forEach(k => colors.add(k)));
    Object.keys(solution).forEach(k => {
        if (!k.endsWith('Placements') && Array.isArray(solution[k])) colors.add(k);
    });

    for (const color of colors) {
        const cells = solution[color] || [];
        const counts = calculateCounts(cells, gridRows, gridCols);
        colorSets[color] = new Set(cells.map(([r, c]) => `${r},${c}`));

        // Check row requirements
        for (let r = 0; r < gridRows; r++) {
            const expected = rowReqs[r][color] || 0;
            if (counts.rowCounts[r] !== expected) {
                errors.push(`Row ${r} ${color}: expected ${expected}, got ${counts.rowCounts[r]}`);
            }
        }

        // Check col requirements
        for (let c = 0; c < gridCols; c++) {
            const expected = colReqs[c][color] || 0;
            if (counts.colCounts[c] !== expected) {
                errors.push(`Col ${c} ${color}: expected ${expected}, got ${counts.colCounts[c]}`);
            }
        }
    }

    // Check for overlaps between any two colors
    const colorList = Array.from(colorSets.keys());
    for (let i = 0; i < colorList.length; i++) {
        for (let j = i + 1; j < colorList.length; j++) {
            const colorA = colorList[i];
            const colorB = colorList[j];
            for (const cell of colorSets[colorA]) {
                if (colorSets[colorB].has(cell)) {
                    errors.push(`Overlap at ${cell} between ${colorA} and ${colorB}`);
                }
            }
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

// Solver with exact shape counts and row/column requirements
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

    // Identify all colors that have at least one requirement
    // Usually green, blue, but now could include cyan, etc.
    const colorsWithReqs = [];
    // We check green and blue first to maintain traditional priority if possible
    const checkOrder = ['green', 'blue', 'cyan', 'red', 'purple'];
    const allKnownColors = new Set();
    rowReqs.forEach(r => Object.keys(r).forEach(k => allKnownColors.add(k)));

    for (const color of checkOrder) {
        if (allKnownColors.has(color)) {
            const hasReq = rowReqs.some(r => r[color] > 0) || colReqs.some(c => c[color] > 0);
            if (hasReq) colorsWithReqs.push(color);
        }
    }
    // Add any unknown colors found in rowReqs
    for (const color of allKnownColors) {
        if (!checkOrder.includes(color)) {
            const hasReq = rowReqs.some(r => r[color] > 0) || colReqs.some(c => c[color] > 0);
            if (hasReq) colorsWithReqs.push(color);
        }
    }

    if (colorsWithReqs.length === 0) {
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

    // Helper to solve colors one by one
    function solveNextColor(colorIdx, currentForbidden, currentUsedIndices) {
        if (colorIdx >= colorsWithReqs.length) {
            // Base case: all colors satisfied
            return [{ cellsByColor: {}, placementsByColor: {} }];
        }

        const color = colorsWithReqs[colorIdx];
        const isLastColor = (colorIdx === colorsWithReqs.length - 1);

        // Filter shapes available for this color
        const availableShapeIndices = [];
        const availableShapes = [];
        for (let i = 0; i < shapeInstances.length; i++) {
            if (!currentUsedIndices.has(i)) {
                availableShapeIndices.push(i);
                availableShapes.push(shapeInstances[i]);
            }
        }

        if (availableShapes.length === 0) return [];

        let subSolutions = [];
        if (isLastColor) {
            // Last color doesn't need to track used indices for further steps
            subSolutions = solveForColorWithCountsSimple(color, availableShapes, placementsByShape, gridRows, gridCols, rowReqs, colReqs, currentForbidden);
        } else {
            // Intermediate color needs to track which shapes it uses
            subSolutions = solveForColorWithCounts(color, availableShapes, placementsByShape, gridRows, gridCols, rowReqs, colReqs, currentForbidden);
        }

        const solutions = [];
        for (const subSol of subSolutions) {
            // Map subSol indices back to original shapeInstances indices
            const newUsedIndices = new Set(currentUsedIndices);
            if (subSol.usedShapeIndices) {
                subSol.usedShapeIndices.forEach(idx => newUsedIndices.add(availableShapeIndices[idx]));
            }

            const nextForbidden = [...currentForbidden, ...subSol.cells];
            const remainingColorSolutions = solveNextColor(colorIdx + 1, nextForbidden, newUsedIndices);

            for (const restSol of remainingColorSolutions) {
                const combinedCells = { ...restSol.cellsByColor };
                combinedCells[color] = subSol.cells;

                const combinedPlacements = { ...restSol.placementsByColor };
                combinedPlacements[color] = subSol.placements;

                solutions.push({
                    cellsByColor: combinedCells,
                    placementsByColor: combinedPlacements
                });

                if (solutions.length >= 50) break;
            }
            if (solutions.length >= 50) break;
        }

        return solutions;
    }

    const rawSolutions = solveNextColor(0, blockedCells, new Set());

    if (rawSolutions.length === 0) {
        return { success: false, message: 'No valid solution found with selected shapes and requirements' };
    }

    // Format solutions for consistent output (UI expects .green, .blue, etc.)
    const formattedSolutions = rawSolutions.map(sol => {
        const formatted = {
            green: sol.cellsByColor.green || [],
            blue: sol.cellsByColor.blue || [],
            greenPlacements: sol.placementsByColor.green || [],
            bluePlacements: sol.placementsByColor.blue || []
        };
        // Add any other colors (like cyan)
        for (const color in sol.cellsByColor) {
            if (color !== 'green' && color !== 'blue') {
                formatted[color] = sol.cellsByColor[color];
                formatted[color + 'Placements'] = sol.placementsByColor[color];
            }
        }
        return formatted;
    });

    return { success: true, solutions: formattedSolutions };
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
