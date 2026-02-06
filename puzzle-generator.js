/**
 * Puzzle Generator for Originium Circuitry
 * Generates solvable puzzles with configurable difficulty
 */

// Logging utility - suppressed during benchmark mode
function generatorLog(...args) {
    if (!window.BENCHMARK_MODE) console.log(...args);
}
function generatorWarn(...args) {
    if (!window.BENCHMARK_MODE) console.warn(...args);
}
function generatorError(...args) {
    if (!window.BENCHMARK_MODE) console.error(...args);
}

const PuzzleGenerator = {
    config: null,
    shapes: null,

    /**
     * Main entry point - generate a puzzle
     * Uses time-based retries to be machine-agnostic
     */
    generate(config) {
        this.config = {
            gridRows: config.gridRows || 5,
            gridCols: config.gridCols || 5,
            colors: config.colors || ['green', 'blue'],
            blockers: config.blockers !== false,
            locks: config.locks || false,
            shapePool: config.shapePool || Object.keys(SHAPE_LIBRARY)
        };

        generatorLog('Starting puzzle generation with config:', this.config);

        // Time-based retry: try for up to 4 seconds total
        const maxDuration = 4000;
        const startTime = Date.now();
        let attempts = 0;

        while (Date.now() - startTime < maxDuration) {
            attempts++;
            const result = this._attemptGeneration();
            if (result.success) {
                generatorLog(`Puzzle generated successfully after ${attempts} attempts in ${Date.now() - startTime}ms`);
                return result.puzzle;
            }
        }

        generatorError(`Failed to generate puzzle after ${attempts} attempts in ${Date.now() - startTime}ms`);
        return null;
    },

    /**
     * Single generation attempt
     */
    _attemptGeneration() {
        // Phase 1: Budget allocation
        const budget = this._allocateBudget();
        generatorLog('Budget allocated:', budget);

        // Phase 2: Shape selection per color
        const shapeSelection = this._selectShapes(budget);
        if (!shapeSelection.success) {
            return { success: false, reason: 'Shape selection failed' };
        }
        generatorLog('Shapes selected:', shapeSelection);

        // Phase 3: Blocker/Lock budget
        const blockerLockBudget = this._calculateBlockerLockBudget(budget, shapeSelection);
        generatorLog('Blocker/Lock budget:', blockerLockBudget);

        // Phase 4: Lock color distribution
        const lockDistribution = this._distributeLocks(blockerLockBudget);
        generatorLog('Lock distribution:', lockDistribution);

        // Phase 5: Placement strategy
        const strategy = Math.random() < 0.5 ? 'symmetrical' : 'chaotic';
        generatorLog('Placement strategy:', strategy);

        // Phase 6: Place shapes and validate solution
        const placementResult = this._placeAndValidate(shapeSelection, blockerLockBudget, lockDistribution, strategy);
        if (!placementResult.success) {
            return { success: false, reason: 'Placement/validation failed' };
        }

        // Phase 7: Calculate display requirements
        const displayRequirements = this._calculateDisplayRequirements(placementResult);

        return {
            success: true,
            puzzle: {
                grid: placementResult.grid,
                shapes: placementResult.shapes,
                blockers: placementResult.blockers,
                locks: placementResult.locks,
                requirements: displayRequirements,
                solution: placementResult.solution
            }
        };
    },

    /**
     * Phase 1: Allocate cell budget per color
     */
    _allocateBudget() {
        const totalCells = this.config.gridRows * this.config.gridCols;
        const colorCount = this.config.colors.length;

        // Calculate minimum reserve for blockers/locks
        const minReserve = Math.floor((this.config.gridRows + this.config.gridCols) / 1.5);
        const reserveNeeded = (this.config.blockers || this.config.locks) ? minReserve : 0;

        const availableForShapes = totalCells - reserveNeeded;
        const budgetPerColor = Math.floor(availableForShapes / colorCount);

        return {
            totalCells,
            colorCount,
            reserveNeeded,
            availableForShapes,
            budgetPerColor,
            colorBudgets: this.config.colors.reduce((acc, color) => {
                acc[color] = budgetPerColor;
                return acc;
            }, {})
        };
    },

    /**
     * Phase 2: Select shapes for each color
     */
    _selectShapes(budget) {
        const selection = {
            success: true,
            colorShapes: {},
            colorRemainders: {},
            totalRemainder: 0
        };

        for (const color of this.config.colors) {
            let remaining = budget.colorBudgets[color];
            const shapes = [];

            while (remaining > 0) {
                // Find valid shapes that fit in remaining budget
                const validShapes = this.config.shapePool.filter(shapeId => {
                    const shape = SHAPE_LIBRARY[shapeId];
                    return shape && shape.cellCount <= remaining;
                });

                if (validShapes.length === 0) break;

                // Randomly select a shape
                const shapeId = validShapes[Math.floor(Math.random() * validShapes.length)];
                const shape = SHAPE_LIBRARY[shapeId];

                // Randomly select a rotation
                const rotationIndex = Math.floor(Math.random() * shape.rotations.length);

                shapes.push({
                    shapeId,
                    rotationIndex,
                    cells: shape.rotations[rotationIndex],
                    cellCount: shape.cellCount
                });

                remaining -= shape.cellCount;
            }

            if (shapes.length === 0) {
                selection.success = false;
                return selection;
            }

            selection.colorShapes[color] = shapes;
            selection.colorRemainders[color] = remaining;
            selection.totalRemainder += remaining;
        }

        return selection;
    },

    /**
     * Phase 3: Calculate blocker and lock budgets
     */
    _calculateBlockerLockBudget(budget, shapeSelection) {
        let totalRemainder = shapeSelection.totalRemainder + budget.reserveNeeded;

        // If we don't have enough remainder, steal from last color
        if (totalRemainder < budget.reserveNeeded && this.config.colors.length > 0) {
            const deficit = budget.reserveNeeded - totalRemainder;
            // This would require re-selecting shapes for the last color with reduced budget
            // For now, we'll work with what we have
            generatorWarn(`Remainder deficit: ${deficit}`);
        }

        let blockerBudget = 0;
        let lockBudget = 0;

        if (this.config.blockers && this.config.locks) {
            blockerBudget = Math.floor(totalRemainder / 2);
            lockBudget = totalRemainder - blockerBudget;
        } else if (this.config.blockers) {
            blockerBudget = totalRemainder;
        } else if (this.config.locks) {
            lockBudget = totalRemainder;
        }

        return { blockerBudget, lockBudget, totalRemainder };
    },

    /**
     * Phase 4: Distribute locks among colors
     */
    _distributeLocks(blockerLockBudget) {
        const distribution = {};
        const colorCount = this.config.colors.length;

        if (blockerLockBudget.lockBudget === 0) {
            this.config.colors.forEach(c => distribution[c] = 0);
            return distribution;
        }

        const locksPerColor = Math.floor(blockerLockBudget.lockBudget / colorCount);
        let remainder = blockerLockBudget.lockBudget % colorCount;

        for (const color of this.config.colors) {
            distribution[color] = locksPerColor;
        }

        // Distribute remainder randomly
        while (remainder > 0) {
            const randomColor = this.config.colors[Math.floor(Math.random() * colorCount)];
            distribution[randomColor]++;
            remainder--;
        }

        return distribution;
    },

    /**
     * Phase 5 & 6: Place shapes and validate
     * Count-based retries here (fast per attempt), time-based only at outer level
     */
    _placeAndValidate(shapeSelection, blockerLockBudget, lockDistribution, strategy) {
        const gridRows = this.config.gridRows;
        const gridCols = this.config.gridCols;

        // Try several times with blockers/locks (each attempt is fast)
        for (let attempt = 0; attempt < 5; attempt++) {
            // Create empty grid
            const grid = Array(gridRows).fill(null).map(() => Array(gridCols).fill('empty'));

            // Place blockers
            const blockers = this._placeBlockers(grid, blockerLockBudget.blockerBudget, strategy);

            // Place locks
            const locks = this._placeLocks(grid, lockDistribution, strategy);

            // Try to place shapes using solver logic
            const placementResult = this._findValidPlacement(grid, shapeSelection.colorShapes, blockers, locks);

            if (placementResult.success) {
                return {
                    success: true,
                    grid: placementResult.grid,
                    shapes: placementResult.shapes,
                    blockers,
                    locks,
                    solution: placementResult.solution
                };
            }
        }

        // Fallback: Try without blockers/locks (single attempt)
        const grid = Array(gridRows).fill(null).map(() => Array(gridCols).fill('empty'));
        const placementResult = this._findValidPlacement(grid, shapeSelection.colorShapes, [], {});

        if (placementResult.success) {
            // Place blockers/locks in empty cells
            const emptyCells = this._findEmptyCells(placementResult.grid);
            const blockers = this._placeInEmptyCells(emptyCells, blockerLockBudget.blockerBudget);
            const remainingCells = emptyCells.slice(blockerLockBudget.blockerBudget);
            const locks = this._placeLocksinEmptyCells(remainingCells, lockDistribution);

            // IMPORTANT: Update the grid with blockers and locks
            // (the helper functions only return positions, they don't modify the grid)
            for (const [r, c] of blockers) {
                placementResult.grid[r][c] = 'blocked';
            }
            for (const color of Object.keys(locks)) {
                for (const [r, c] of locks[color]) {
                    placementResult.grid[r][c] = `locked-${color}`;
                }
            }

            return {
                success: true,
                grid: placementResult.grid,
                shapes: placementResult.shapes,
                blockers,
                locks,
                solution: placementResult.solution
            };
        }

        return { success: false };
    },

    /**
     * Place blockers on grid
     */
    _placeBlockers(grid, count, strategy) {
        const blockers = [];
        const rows = grid.length;
        const cols = grid[0].length;

        if (strategy === 'symmetrical') {
            // Place in symmetrical patterns
            const center = [Math.floor(rows / 2), Math.floor(cols / 2)];
            let placed = 0;

            while (placed < count) {
                const r = Math.floor(Math.random() * Math.ceil(rows / 2));
                const c = Math.floor(Math.random() * Math.ceil(cols / 2));

                const positions = [
                    [r, c],
                    [r, cols - 1 - c],
                    [rows - 1 - r, c],
                    [rows - 1 - r, cols - 1 - c]
                ].filter(([pr, pc]) => grid[pr][pc] === 'empty');

                for (const [pr, pc] of positions) {
                    if (placed >= count) break;
                    if (grid[pr][pc] === 'empty') {
                        grid[pr][pc] = 'blocked';
                        blockers.push([pr, pc]);
                        placed++;
                    }
                }
            }
        } else {
            // Chaotic - random placement
            let placed = 0;
            let attempts = 0;
            while (placed < count && attempts < count * 10) {
                const r = Math.floor(Math.random() * rows);
                const c = Math.floor(Math.random() * cols);
                if (grid[r][c] === 'empty') {
                    grid[r][c] = 'blocked';
                    blockers.push([r, c]);
                    placed++;
                }
                attempts++;
            }
        }

        return blockers;
    },

    /**
     * Place locks on grid
     */
    _placeLocks(grid, distribution, strategy) {
        const locks = {};
        const rows = grid.length;
        const cols = grid[0].length;

        for (const color of Object.keys(distribution)) {
            locks[color] = [];
            const count = distribution[color];

            if (strategy === 'symmetrical') {
                let placed = 0;
                while (placed < count) {
                    const r = Math.floor(Math.random() * rows);
                    const c = Math.floor(Math.random() * cols);
                    if (grid[r][c] === 'empty') {
                        grid[r][c] = `locked-${color}`;
                        locks[color].push([r, c]);
                        placed++;
                    }
                }
            } else {
                let placed = 0;
                let attempts = 0;
                while (placed < count && attempts < count * 10) {
                    const r = Math.floor(Math.random() * rows);
                    const c = Math.floor(Math.random() * cols);
                    if (grid[r][c] === 'empty') {
                        grid[r][c] = `locked-${color}`;
                        locks[color].push([r, c]);
                        placed++;
                    }
                    attempts++;
                }
            }
        }

        return locks;
    },

    /**
     * Find valid placement for all shapes
     */
    _findValidPlacement(grid, colorShapes, blockers, locks) {
        const rows = grid.length;
        const cols = grid[0].length;
        const solution = {};
        const placedShapes = {};

        // Deep copy grid
        const workingGrid = grid.map(row => [...row]);

        for (const color of Object.keys(colorShapes)) {
            const shapes = colorShapes[color];
            const placements = [];

            for (const shape of shapes) {
                const placement = this._findShapePlacement(workingGrid, shape, color);
                if (!placement) {
                    return { success: false };
                }
                placements.push(placement);

                // Mark cells as occupied
                for (const [r, c] of placement.cells) {
                    workingGrid[r][c] = color;
                }
            }

            placedShapes[color] = placements;
            solution[color] = placements.flatMap(p => p.cells);
        }

        return {
            success: true,
            grid: workingGrid,
            shapes: placedShapes,
            solution
        };
    },

    /**
     * Find placement for a single shape
     */
    _findShapePlacement(grid, shape, color) {
        const rows = grid.length;
        const cols = grid[0].length;
        const bounds = getShapeBounds(shape.cells);

        // Collect all valid positions
        const validPositions = [];

        for (let r = 0; r <= rows - bounds.height; r++) {
            for (let c = 0; c <= cols - bounds.width; c++) {
                const cells = shape.cells.map(([sr, sc]) => [r + sr, c + sc]);
                const isValid = cells.every(([cr, cc]) => grid[cr][cc] === 'empty');

                if (isValid) {
                    validPositions.push({ row: r, col: c, cells });
                }
            }
        }

        if (validPositions.length === 0) return null;

        // Pick random valid position
        const chosen = validPositions[Math.floor(Math.random() * validPositions.length)];
        return {
            shapeId: shape.shapeId,
            rotationIndex: shape.rotationIndex,
            position: [chosen.row, chosen.col],
            cells: chosen.cells,
            color
        };
    },

    /**
     * Find empty cells in grid
     */
    _findEmptyCells(grid) {
        const empty = [];
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                if (grid[r][c] === 'empty') {
                    empty.push([r, c]);
                }
            }
        }
        // Shuffle
        for (let i = empty.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [empty[i], empty[j]] = [empty[j], empty[i]];
        }
        return empty;
    },

    /**
     * Place blockers in empty cells
     */
    _placeInEmptyCells(emptyCells, count) {
        return emptyCells.slice(0, count);
    },

    /**
     * Place locks in empty cells
     */
    _placeLocksinEmptyCells(emptyCells, distribution) {
        const locks = {};
        let index = 0;

        for (const color of Object.keys(distribution)) {
            locks[color] = [];
            const count = distribution[color];
            for (let i = 0; i < count && index < emptyCells.length; i++) {
                locks[color].push(emptyCells[index]);
                index++;
            }
        }

        return locks;
    },

    /**
     * Phase 7: Calculate display requirements
     */
    _calculateDisplayRequirements(placementResult) {
        const rows = placementResult.grid.length;
        const cols = placementResult.grid[0].length;
        const requirements = {
            rows: [],
            cols: []
        };

        // Calculate row requirements
        for (let r = 0; r < rows; r++) {
            const rowReq = {};
            for (const color of this.config.colors) {
                rowReq[color] = 0;
            }

            for (let c = 0; c < cols; c++) {
                const cell = placementResult.grid[r][c];
                for (const color of this.config.colors) {
                    if (cell === color || cell === `locked-${color}`) {
                        rowReq[color]++;
                    }
                }
            }

            requirements.rows.push(rowReq);
        }

        // Calculate column requirements
        for (let c = 0; c < cols; c++) {
            const colReq = {};
            for (const color of this.config.colors) {
                colReq[color] = 0;
            }

            for (let r = 0; r < rows; r++) {
                const cell = placementResult.grid[r][c];
                for (const color of this.config.colors) {
                    if (cell === color || cell === `locked-${color}`) {
                        colReq[color]++;
                    }
                }
            }

            requirements.cols.push(colReq);
        }

        return requirements;
    }
};
