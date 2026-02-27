/**
 * Originium Circuitry Image Analyzer
 * 
 * Extracts puzzle data from Arknights Endfield screenshots:
 * - Grid dimensions and cell states
 * - Row/column requirements
 * - Shape inventory
 * - Blocked rows/columns
 */

/**
 * Main entry point for analyzing a puzzle screenshot.
 * @param {ImageBitmap|HTMLImageElement|HTMLCanvasElement} image - The source image
 * @returns {Promise<Object>} Analysis results matching the generateGrid(overrides) contract
 */
async function analyzePuzzleImage(image, ENABLE_DEBUG_VISUALIZATION) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // 1. Detect Grid Bounds
    const gridBounds = detectGridBounds(canvas, ENABLE_DEBUG_VISUALIZATION);
    if (!gridBounds) throw new Error('Grid not detected (could not find corner brackets)');

    // 2. Detect Grid Dimensions (Rows/Cols)
    const { gridRows, gridCols } = detectGridDimensions(imageData, gridBounds);

    // 3. Classify Cell States
    const gridState = classifyCells(imageData, gridBounds, gridRows, gridCols);

    // 4. Extract Row/Column Requirements
    const requirements = extractRequirements(imageData, gridBounds, gridRows, gridCols);

    // 5. Detect Blocked Rows/Columns (⊘)
    const { blockedRows, blockedCols } = detectBlockedRowsCols(imageData, gridBounds, gridRows, gridCols);

    // 6. Detect Inventory (Shapes)
    const { shapeCounts, detectedTiles } = detectInventory(imageData, image.width, image.height, ENABLE_DEBUG_VISUALIZATION);

    // 7. Compute Confidence Level
    let confidence = 'full';
    const hasShapes = Object.keys(shapeCounts).length > 0;
    const hasZeros = requirements.rows.some(r => r.green === 0 && r.blue === 0) ||
        requirements.cols.some(c => c.green === 0 && c.blue === 0);

    if (!hasShapes || hasZeros) {
        confidence = 'partial';
    }

    return {
        gridRows,
        gridCols,
        gridState,
        requirements,
        shapeCounts,
        blockedRows,
        blockedCols,
        confidence,
        _debug: {
            gridBounds,
            imageWidth: image.width,
            imageHeight: image.height,
            detectedTiles
        }
    };
}

/**
 * Find the grid boundaries by searching for the corner brackets.
 * Uses a hardcoded search area (580, 145) to (1980, 1300) scaled from 2560x1440.
 */
function detectGridBounds(srcImage, ENABLE_DEBUG_VISUALIZATION) {
    // 1. Read the main image and the template images
    let src = cv.imread(srcImage);
    let topLeftCornerTempl = cv.imread('corner_top_left');
    let bottomRightCornerTempl = cv.imread('corner_bottom_right');
    let result = new cv.Mat();

    // 2. Calculate the exact UI scale factor
    // Target Height / Reference Height (1440)
    const scaleFactor = src.rows / 1440;

    // 3. Calculate the new dimensions for the templates
    let tlWidth = Math.round(topLeftCornerTempl.cols * scaleFactor);
    let tlHeight = Math.round(topLeftCornerTempl.rows * scaleFactor);
    let brWidth = Math.round(bottomRightCornerTempl.cols * scaleFactor);
    let brHeight = Math.round(bottomRightCornerTempl.rows * scaleFactor);

    // 4. Define the Region of Interest (ROI) for the grid
    let roiX = Math.round(580 * scaleFactor);
    let roiY = Math.round(130 * scaleFactor);
    let roiWidth = Math.round(1400 * scaleFactor);  // 1980 - 580
    let roiHeight = Math.round(1180 * scaleFactor); // 1310 - 130

    let roi = new cv.Rect(roiX, roiY, roiWidth, roiHeight);
    let srcRoi = src.roi(roi);

    // 5. Resize the templates using NEAREST-NEIGHBOR to prevent edge blurring
    if (scaleFactor !== 1) {
        cv.resize(topLeftCornerTempl, topLeftCornerTempl, new cv.Size(tlWidth, tlHeight), 0, 0, cv.INTER_NEAREST);
        cv.resize(bottomRightCornerTempl, bottomRightCornerTempl, new cv.Size(brWidth, brHeight), 0, 0, cv.INTER_NEAREST);
    }

    // 6. Color Masking
    let srcMask = new cv.Mat();
    let tlMask = new cv.Mat();
    let brMask = new cv.Mat();

    // Define color bounds for our target grey [143, 143, 143] +/- 10 tolerance
    let lowColorRoi = new cv.Mat(srcRoi.rows, srcRoi.cols, srcRoi.type(), [133, 133, 133, 0]);
    let highColorRoi = new cv.Mat(srcRoi.rows, srcRoi.cols, srcRoi.type(), [153, 153, 153, 255]);

    let lowColorTl = new cv.Mat(topLeftCornerTempl.rows, topLeftCornerTempl.cols, topLeftCornerTempl.type(), [133, 133, 133, 0]);
    let highColorTl = new cv.Mat(topLeftCornerTempl.rows, topLeftCornerTempl.cols, topLeftCornerTempl.type(), [153, 153, 153, 255]);

    let lowColorBr = new cv.Mat(bottomRightCornerTempl.rows, bottomRightCornerTempl.cols, bottomRightCornerTempl.type(), [133, 133, 133, 0]);
    let highColorBr = new cv.Mat(bottomRightCornerTempl.rows, bottomRightCornerTempl.cols, bottomRightCornerTempl.type(), [153, 153, 153, 255]);

    // Apply the filter: target colors turn white (255), everything else turns black (0)
    cv.inRange(srcRoi, lowColorRoi, highColorRoi, srcMask);
    cv.inRange(topLeftCornerTempl, lowColorTl, highColorTl, tlMask);
    cv.inRange(bottomRightCornerTempl, lowColorBr, highColorBr, brMask);

    // 7. Perform Template Matching for top-left corner
    cv.matchTemplate(srcMask, tlMask, result, cv.TM_CCOEFF_NORMED);

    // 8. Find the best match location for top-left corner
    let minMax = cv.minMaxLoc(result);
    let maxPoint = minMax.maxLoc;
    let confidence = minMax.maxVal;
    let topLeftCorner = { x: maxPoint.x, y: maxPoint.y };

    // 9. Verify the match for top-left corner
    if (confidence > 0.60) {
        if (ENABLE_DEBUG_VISUALIZATION) {
            console.log(`Top-left corner found at X: ${maxPoint.x}, Y: ${maxPoint.y} with ${(confidence * 100).toFixed(2)}% confidence.`);
        }
    } else {
        throw new Error("Top-left corner bracket not found. Highest confidence was only: " + confidence);
    }

    // 10. Perform Template Matching for bottom-right corner
    cv.matchTemplate(srcMask, brMask, result, cv.TM_CCOEFF_NORMED);

    // 11. Find the best match location for bottom-right corner
    minMax = cv.minMaxLoc(result);
    maxPoint = minMax.maxLoc;
    confidence = minMax.maxVal;
    let bottomRightCorner = { x: maxPoint.x, y: maxPoint.y };

    // 12. Verify the match for bottom-right corner
    if (confidence > 0.60) {
        if (ENABLE_DEBUG_VISUALIZATION) {
            console.log(`Bottom-right corner found at X: ${maxPoint.x}, Y: ${maxPoint.y} with ${(confidence * 100).toFixed(2)}% confidence.`);
        }
    } else {
        throw new Error("Bottom-right corner bracket not found. Highest confidence was only: " + confidence);
    }

    // 13. Clean up memory
    src.delete(); topLeftCornerTempl.delete(); bottomRightCornerTempl.delete();
    result.delete(); srcRoi.delete();
    srcMask.delete(); tlMask.delete(); brMask.delete();
    lowColorRoi.delete(); highColorRoi.delete();
    lowColorTl.delete(); highColorTl.delete();
    lowColorBr.delete(); highColorBr.delete();

    return {
        left: topLeftCorner.x + roiX + tlWidth,
        top: topLeftCorner.y + roiY + tlHeight,
        right: bottomRightCorner.x + roiX,
        bottom: bottomRightCorner.y + roiY
    };
}

/**
 * Derive grid dimensions from bounds using fixed cell geometry.
 */
function detectGridDimensions(imageData, gridBounds) {
    const imgWidth = imageData.width;
    const resScale = imgWidth / 2560;

    // Reference: 2560x1440 -> cell 116px, gap 6px, stride 122px
    let cellSize = 116 * resScale;
    let gap = 6 * resScale;
    let stride = cellSize + gap;

    let columns = (gridBounds.right - gridBounds.left) / stride;
    let rows = (gridBounds.bottom - gridBounds.top) / stride;

    columns = Math.round(columns);
    rows = Math.round(rows);

    return { gridRows: rows, gridCols: columns };
}

function classifyCells(imageData, gridBounds, rows, cols) {
    const imgWidth = imageData.width;
    const resScale = imgWidth / 2560;

    // Use the same geometry as detectGridDimensions
    const cellSize = 116 * resScale;
    const gap = 6 * resScale;
    const stride = cellSize + gap;

    // Sample a square region at the center of each cell
    const sampleSize = Math.max(4, Math.round(cellSize * 0.25));

    const data = imageData.data;
    const imgW = imageData.width;

    const gridState = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            // Top-left pixel of this cell
            const cellX = gridBounds.left + c * stride;
            const cellY = gridBounds.top + r * stride;

            // Center region to sample
            const sx = Math.round(cellX + (cellSize - sampleSize) / 2);
            const sy = Math.round(cellY + (cellSize - sampleSize) / 2);

            // Accumulate R, G, B over the sample region
            let sumR = 0, sumG = 0, sumB = 0, count = 0;
            for (let dy = 0; dy < sampleSize; dy++) {
                for (let dx = 0; dx < sampleSize; dx++) {
                    const px = sx + dx;
                    const py = sy + dy;
                    if (px < 0 || py < 0 || px >= imgW || py >= imageData.height) continue;
                    const idx = (py * imgW + px) * 4;
                    sumR += data[idx];
                    sumG += data[idx + 1];
                    sumB += data[idx + 2];
                    count++;
                }
            }

            let state = 'empty';
            if (count > 0) {
                const meanR = sumR / count;
                const meanG = sumG / count;
                const meanB = sumB / count;
                const brightness = (meanR + meanG + meanB) / 3;

                // Compute saturation (max - min) / max, guarded against division by zero
                const maxC = Math.max(meanR, meanG, meanB);
                const minC = Math.min(meanR, meanG, meanB);
                const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;

                if (meanG > 150 && meanG > meanR && meanG > meanB) {
                    // Bright yellow-green (~rgb(180, 220, 10))
                    state = 'locked-green';
                } else if (meanB > 150 && meanB > meanR && meanB > meanG) {
                    // Bright cyan-blue (~rgb(80, 180, 220))
                    state = 'locked-blue';
                } else if (brightness >= 60 && brightness <= 140 && saturation < 0.2) {
                    // Medium-grey diagonal hash background
                    state = 'blocked';
                } else {
                    // Dark, low-saturation background
                    state = 'empty';
                }
            }

            row.push(state);
        }
        gridState.push(row);
    }

    return gridState;
}

/**
 * Helper function to count consecutive runs of qualifying strips
 * @param {boolean[]} boolArray - Array of boolean values indicating qualifying strips
 * @param {number} minRun - Minimum consecutive qualifying strips to count as a run
 * @returns {number} Number of runs found
 */
function countRuns(boolArray, minRun) {
    let runs = 0, inRun = false, runLen = 0;
    for (const v of boolArray) {
        if (v) {
            inRun = true;
            runLen++;
        }
        else {
            if (inRun && runLen >= minRun) runs++;
            inRun = false;
            runLen = 0;
        }
    }
    if (inRun && runLen >= minRun) runs++;
    return runs;
}

/**
 * Count color runs by scanning column-by-column within a region
 * Used for row requirements (horizontal bars arranged side by side)
 * @param {ImageData} imageData - The image data to analyze
 * @param {number} rx - Region x coordinate
 * @param {number} ry - Region y coordinate  
 * @param {number} rw - Region width
 * @param {number} rh - Region height
 * @returns {Object} { green: number, blue: number }
 */
function countColorRuns(imageData, rx, ry, rw, rh) {
    const data = imageData.data;
    const imgW = imageData.width;
    const imgH = imageData.height;
    const MIN_RUN = 3;           // minimum consecutive qualifying columns to form a run
    const PIXEL_THRESHOLD = 1;   // minimum green/blue pixels in a column to count it

    const greenStrips = [];  // bool per column: is this column-strip green?
    const blueStrips = [];   // bool per column: is this column-strip blue?

    for (let dx = 0; dx < rw; dx++) {
        const px = Math.round(rx + dx);
        if (px < 0 || px >= imgW) {
            greenStrips.push(false);
            blueStrips.push(false);
            continue;
        }
        let gCount = 0, bCount = 0;
        for (let dy = 0; dy < rh; dy++) {
            const py = Math.round(ry + dy);
            if (py < 0 || py >= imgH) continue;
            const i = (py * imgW + px) * 4;
            const R = data[i], G = data[i + 1], B = data[i + 2];
            if (G > 180 && G > R * 1.3 && G > B * 1.5) gCount++;
            else if (B > 160 && B > R * 1.4 && B > G * 1.1) bCount++;
        }
        greenStrips.push(gCount >= PIXEL_THRESHOLD);
        blueStrips.push(bCount >= PIXEL_THRESHOLD);
    }

    return {
        green: countRuns(greenStrips, MIN_RUN),
        blue: countRuns(blueStrips, MIN_RUN),
    };
}

/**
 * Count color runs by scanning row-by-row within a region
 * Used for column requirements (vertical bars stacked above columns)
 * @param {ImageData} imageData - The image data to analyze
 * @param {number} rx - Region x coordinate
 * @param {number} ry - Region y coordinate  
 * @param {number} rw - Region width
 * @param {number} rh - Region height
 * @returns {Object} { green: number, blue: number }
 */
function countColorRunsVertical(imageData, rx, ry, rw, rh) {
    const data = imageData.data;
    const imgW = imageData.width;
    const imgH = imageData.height;
    const MIN_RUN = 3;           // minimum consecutive qualifying rows to form a run
    const PIXEL_THRESHOLD = 1;   // minimum green/blue pixels in a row to count it

    const greenStrips = [];  // bool per row: is this row-strip green?
    const blueStrips = [];   // bool per row: is this row-strip blue?

    for (let dy = 0; dy < rh; dy++) {
        const py = Math.round(ry + dy);
        if (py < 0 || py >= imgH) {
            greenStrips.push(false);
            blueStrips.push(false);
            continue;
        }
        let gCount = 0, bCount = 0;
        for (let dx = 0; dx < rw; dx++) {
            const px = Math.round(rx + dx);
            if (px < 0 || px >= imgW) continue;
            const i = (py * imgW + px) * 4;
            const R = data[i], G = data[i + 1], B = data[i + 2];
            if (G > 180 && G > R * 1.3 && G > B * 1.5) gCount++;
            else if (B > 160 && B > R * 1.4 && B > G * 1.1) bCount++;
        }
        greenStrips.push(gCount >= PIXEL_THRESHOLD);
        blueStrips.push(bCount >= PIXEL_THRESHOLD);
    }

    return {
        green: countRuns(greenStrips, MIN_RUN),
        blue: countRuns(blueStrips, MIN_RUN),
    };
}

/**
 * Check if a region contains a blocked symbol (⊘) instead of colored bars
 * @param {ImageData} imageData - The image data to analyze
 * @param {number} rx - Region x coordinate
 * @param {number} ry - Region y coordinate  
 * @param {number} rw - Region width
 * @param {number} rh - Region height
 * @returns {boolean} True if region appears to contain a blocked symbol
 */
function isRegionBlockedSymbol(imageData, rx, ry, rw, rh) {
    const data = imageData.data;
    const imgW = imageData.width;
    let sumR = 0, sumG = 0, sumB = 0, count = 0;

    for (let dy = 0; dy < rh; dy++) {
        for (let dx = 0; dx < rw; dx++) {
            const px = Math.round(rx + dx), py = Math.round(ry + dy);
            if (px < 0 || py < 0 || px >= imgW || py >= imageData.height) continue;
            const i = (py * imgW + px) * 4;
            sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2];
            count++;
        }
    }

    if (count === 0) return false;

    const meanR = sumR / count, meanG = sumG / count, meanB = sumB / count;
    const brightness = (meanR + meanG + meanB) / 3;
    const maxC = Math.max(meanR, meanG, meanB);
    const minC = Math.min(meanR, meanG, meanB);
    const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;

    // Grey + no saturated color = ⊘ row/column
    return brightness >= 80 && brightness <= 180 && saturation < 0.15;
}

/**
 * Extract row and column requirements from the image
 * Row requirements: colored bar segments to the left of each row
 * Column requirements: colored bar segments above each column
 */
function extractRequirements(imageData, gridBounds, rows, cols) {
    const imgW = imageData.width, imgH = imageData.height;
    const resScale = imgW / 2560;
    const cellSize = 116 * resScale, gap = 6 * resScale, stride = cellSize + gap;

    // Row requirements (left margin) — scan column-by-column
    const rowBarWidth = resScale * 20;
    const rowMarginWidth = (cols + 1) * rowBarWidth;
    const rowReqs = [];

    for (let r = 0; r < rows; r++) {
        const centerY = gridBounds.top + (r + 0.5) * stride;
        const rx = Math.max(0, gridBounds.left - rowMarginWidth);
        const ry = centerY - cellSize * 0.3;
        const rw = rowMarginWidth;
        const rh = cellSize * 0.6;
        rowReqs.push(countColorRuns(imageData, rx, ry, rw, rh));
    }

    // Column requirements (top margin) — scan row-by-row
    const colBarHeight = (imgH / 1440) * 20;
    const colMarginHeight = (rows + 1) * colBarHeight;
    const colReqs = [];

    for (let c = 0; c < cols; c++) {
        const centerX = gridBounds.left + (c + 0.5) * stride;
        const rx = centerX - cellSize * 0.3;
        const ry = Math.max(0, gridBounds.top - colMarginHeight);
        const rw = cellSize * 0.6;
        const rh = colMarginHeight;
        colReqs.push(countColorRunsVertical(imageData, rx, ry, rw, rh));
    }

    return { rows: rowReqs, cols: colReqs };
}

/**
 * Detect blocked rows and columns marked with ⊘ symbol
 */
function detectBlockedRowsCols(imageData, gridBounds, rows, cols) {
    const blockedRows = [], blockedCols = [];
    const imgW = imageData.width, imgH = imageData.height;
    const resScale = imgW / 2560;
    const cellSize = 116 * resScale, gap = 6 * resScale, stride = cellSize + gap;

    // Row blocked detection
    const rowBarWidth = resScale * 20;
    const rowMarginWidth = (cols + 1) * rowBarWidth;

    for (let r = 0; r < rows; r++) {
        const centerY = gridBounds.top + (r + 0.5) * stride;
        const rx = Math.max(0, gridBounds.left - rowMarginWidth);
        const ry = centerY - cellSize * 0.3;
        const rw = rowMarginWidth;
        const rh = cellSize * 0.6;

        if (isRegionBlockedSymbol(imageData, rx, ry, rw, rh)) {
            blockedRows.push(r);
        }
    }

    // Column blocked detection (⊘ above a column — rare, future use)
    const colBarHeight = (imgH / 1440) * 20;
    const colMarginHeight = (rows + 1) * colBarHeight;

    for (let c = 0; c < cols; c++) {
        const centerX = gridBounds.left + (c + 0.5) * stride;
        const rx = centerX - cellSize * 0.3;
        const ry = Math.max(0, gridBounds.top - colMarginHeight);
        const rw = cellSize * 0.6;
        const rh = colMarginHeight;

        if (isRegionBlockedSymbol(imageData, rx, ry, rw, rh)) {
            blockedCols.push(c);
        }
    }

    return { blockedRows, blockedCols };
}

/**
 * Check if a tile region contains colored pixels (occupied)
 */
function tileIsOccupied(imageData, tx, ty, tw, th) {
    const data = imageData.data;
    const imgW = imageData.width;
    let colored = 0;
    for (let dy = 0; dy < th; dy++) {
        for (let dx = 0; dx < tw; dx++) {
            const px = tx + dx, py = ty + dy;
            if (px < 0 || py < 0 || px >= imgW || py >= imageData.height) continue;
            const i = (py * imgW + px) * 4;
            const R = data[i], G = data[i + 1], B = data[i + 2];
            if ((G > 150 && G > R * 1.2 && G > B * 1.3) ||
                (B > 140 && B > R * 1.3 && B > G * 1.05)) {
                colored++;
            }
        }
    }
    return colored / (tw * th) >= 0.02;
}

/**
 * Binarize a tile region into a 2D boolean array
 */
function binarizeTile(imageData, tx, ty, tw, th) {
    const filled = [];
    const data = imageData.data;
    const imgW = imageData.width;
    for (let dy = 0; dy < th; dy++) {
        const row = [];
        for (let dx = 0; dx < tw; dx++) {
            const px = tx + dx, py = ty + dy;
            if (px < 0 || py < 0 || px >= imgW || py >= imageData.height) {
                row.push(false);
                continue;
            }
            const i = (py * imgW + px) * 4;
            const R = data[i], G = data[i + 1], B = data[i + 2];
            const isGreen = G > 150 && G > R && G > B;
            const isBlue = B > 140 && B > R && B > G;
            row.push(isGreen || isBlue);
        }
        filled.push(row);
    }
    return filled;
}

/**
 * Find bounding box of filled pixels in a binary grid
 */
function binaryBBox(filled) {
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (let r = 0; r < filled.length; r++) {
        for (let c = 0; c < filled[r].length; c++) {
            if (filled[r][c]) {
                if (r < minR) minR = r;
                if (r > maxR) maxR = r;
                if (c < minC) minC = c;
                if (c > maxC) maxC = c;
            }
        }
    }
    if (minR === Infinity) return null;
    return {
        minR, maxR, minC, maxC,
        h: maxR - minR + 1,
        w: maxC - minC + 1
    };
}

/**
 * Rasterize content from bbox top-left into an N×N grid with fixed cell size.
 * Origin is placed at bbox.minR / bbox.minC so each cell aligns directly with content.
 * @param {boolean[][]} filled - binarized tile
 * @param {Object} bbox - bounding box from binaryBBox
 * @param {number} N - grid dimension
 * @param {number} cellSize - fixed pixel size for each grid cell
 */
function rasterizeToGrid(filled, bbox, N, cellSize) {
    const grid = [];

    for (let gr = 0; gr < N; gr++) {
        const rowArr = [];
        for (let gc = 0; gc < N; gc++) {
            const rStart = Math.round(bbox.minR + gr * cellSize);
            const rEnd = Math.round(bbox.minR + (gr + 1) * cellSize);
            const cStart = Math.round(bbox.minC + gc * cellSize);
            const cEnd = Math.round(bbox.minC + (gc + 1) * cellSize);

            let filledCount = 0, total = 0;
            for (let r = rStart; r < rEnd; r++) {
                for (let c = cStart; c < cEnd; c++) {
                    if (r >= 0 && r < filled.length && c >= 0 && c < filled[r].length) {
                        if (filled[r][c]) filledCount++;
                        total++;
                    }
                }
            }
            rowArr.push(total > 0 && filledCount / total > 0.30);
        }
        grid.push(rowArr);
    }
    return grid;
}

/**
 * Convert grid to normalized cell array
 */
function gridToCells(grid) {
    const cells = [];
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c]) cells.push([r, c]);
        }
    }
    if (cells.length === 0) return [];
    const minR = Math.min(...cells.map(([r]) => r));
    const minC = Math.min(...cells.map(([, c]) => c));
    return cells.map(([r, c]) => [r - minR, c - minC]);
}

/**
 * Match extracted cells against SHAPE_LIBRARY
 */
function matchShape(extractedCells, ENABLE_DEBUG_VISUALIZATION) {
    let current = extractedCells;
    for (let rot = 0; rot < 4; rot++) {
        if (ENABLE_DEBUG_VISUALIZATION) {
            console.log('current shape', current);
        }
        for (const [shapeId, shape] of Object.entries(SHAPE_LIBRARY)) {
            for (const rotation of shape.rotations) {
                if (shapesEqual(current, rotation)) {
                    return shapeId;
                }
            }
        }
        current = rotateShape90(current);
    }
    return null;
}

// Fixed cell pixel sizes for each grid resolution
const GRID_CELL_SIZES = { 2: 42, 3: 28, 4: 21 };

/**
 * Extract shape from a single tile
 */
function extractShapeFromTile(imageData, tx, ty, tw, th, resScale, ENABLE_DEBUG_VISUALIZATION) {
    if (!tileIsOccupied(imageData, tx, ty, tw, th)) return null;
    const filled = binarizeTile(imageData, tx, ty, tw, th);
    const bbox = binaryBBox(filled);
    if (!bbox) return { shapeId: null, bbox: null };

    let fallbackGrid = null;
    let fallbackN = null;
    let fallbackCellSize = null;

    for (const N of [4, 3, 2]) {
        const cellSize = GRID_CELL_SIZES[N] * resScale;
        const grid = rasterizeToGrid(filled, bbox, N, cellSize);
        const cells = gridToCells(grid);
        if (typeof ENABLE_DEBUG_VISUALIZATION !== 'undefined' && ENABLE_DEBUG_VISUALIZATION) {
            console.log(`N=${N} cellSize=${cellSize} bbox=${bbox.h}x${bbox.w} cells=`, JSON.stringify(cells));
        }
        if (N === 3) {
            fallbackGrid = grid;
            fallbackN = N;
            fallbackCellSize = cellSize;
        }
        if (cells.length === 0) continue;
        const match = matchShape(cells, ENABLE_DEBUG_VISUALIZATION);
        if (typeof ENABLE_DEBUG_VISUALIZATION !== 'undefined' && ENABLE_DEBUG_VISUALIZATION) {
            console.log(`  -> matchShape: ${match}`);
        }
        if (match !== null) {
            // Sanity-check: the binary bbox should be roughly the size the matched shape
            // occupies at this grid resolution.
            const matchedBounds = getShapeBounds(cells);
            const expectedH = matchedBounds.height * cellSize;
            const expectedW = matchedBounds.width * cellSize;
            const ratioH = bbox.h / expectedH;
            const ratioW = bbox.w / expectedW;
            const TOLERANCE_LO = 0.55, TOLERANCE_HI = 1.25;
            if (ratioH >= TOLERANCE_LO && ratioH <= TOLERANCE_HI &&
                ratioW >= TOLERANCE_LO && ratioW <= TOLERANCE_HI) {
                return { shapeId: match, bbox, grid, N, cellSize };
            }
            if (typeof ENABLE_DEBUG_VISUALIZATION !== 'undefined' && ENABLE_DEBUG_VISUALIZATION) {
                console.log(`detectInventory: rejected ${match} at N=${N} (ratioH=${ratioH.toFixed(2)}, ratioW=${ratioW.toFixed(2)})`);
            }
        }
    }

    console.warn('detectInventory: no shape match for tile at', tx, ty);
    return { shapeId: null, bbox, grid: fallbackGrid, N: fallbackN, cellSize: fallbackCellSize };
}

/**
 * Detect inventory shapes from the right-panel inventory
 */
function detectInventory(imageData, width, height, ENABLE_DEBUG_VISUALIZATION) {
    const resScale = width / 2560;

    // Panel bounds
    const invLeft = Math.round(width * (2045 / 2560));
    const invTop = Math.round(height * (193 / 1440));
    const invRight = Math.round(width * (2485 / 2560));
    const invBottom = Math.round(height * (1290 / 1440));

    // Tile geometry (scaled from 2560×1440 reference)
    const tileW = Math.round(188 * resScale);
    const tileH = Math.round(188 * resScale);
    const colGapLeft = Math.round(23 * resScale);
    const colGapRight = Math.round(15 * resScale);
    const rowGapTop = Math.round(45 * resScale);
    const rowGap = Math.round(20 * resScale);
    const cols = [invLeft + colGapLeft, invRight - colGapRight - tileW];
    const rowStride = tileH + rowGap;
    const maxRows = Math.max(1, Math.floor((invBottom - invTop - rowGapTop + rowGap) / rowStride));

    const shapeCounts = {};
    const detectedTiles = [];

    for (let row = 0; row < maxRows; row++) {
        for (let col = 0; col < 2; col++) {
            const tx = cols[col];
            const ty = invTop + rowGapTop + row * rowStride;
            if (ty + tileH > invBottom) continue;

            const extractResult = extractShapeFromTile(imageData, tx, ty, tileW, tileH, resScale, ENABLE_DEBUG_VISUALIZATION);
            if (extractResult !== null) {
                if (extractResult.shapeId !== null) {
                    shapeCounts[extractResult.shapeId] = (shapeCounts[extractResult.shapeId] || 0) + 1;
                }
                detectedTiles.push({
                    x: tx, y: ty, w: tileW, h: tileH,
                    ...extractResult
                });
            }
        }
    }

    return { shapeCounts, detectedTiles };
}


// ============================================
// Debug Visualization
// ============================================

/**
 * Draw debug visualization showing what the analyzer detected
 * @param {HTMLImageElement} image - The original uploaded image
 * @param {Object} analysisResults - Results from analyzePuzzleImage
 * @param {Object} detectionData - Intermediate detection data (bounds, etc.)
 */
function drawDebugVisualization(image, analysisResults, detectionData) {
    const debugCanvas = document.getElementById('debugCanvas');
    const debugInfo = document.getElementById('debugInfo');
    const debugArea = document.getElementById('debugArea');

    if (!debugCanvas || !debugInfo || !debugArea) return;

    // Show the debug area
    debugArea.style.display = 'block';

    // Set canvas size to match image
    debugCanvas.width = image.width;
    debugCanvas.height = image.height;

    const ctx = debugCanvas.getContext('2d');

    // Draw the original image
    ctx.drawImage(image, 0, 0);

    // Extract detection data
    const gridBounds = detectionData.gridBounds || {};
    const { gridRows, gridCols, gridState, requirements, blockedRows, blockedCols } = analysisResults;

    // 1. Draw grid bounds (outer rectangle)
    if (gridBounds.left !== undefined) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.strokeRect(
            gridBounds.left,
            gridBounds.top,
            gridBounds.right - gridBounds.left,
            gridBounds.bottom - gridBounds.top
        );

        // Label
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('Grid Bounds', gridBounds.left + 5, gridBounds.top - 10);
    }

    // 2. Draw grid cells
    if (gridRows && gridCols && gridBounds.left !== undefined) {
        const gridWidth = gridBounds.right - gridBounds.left;
        const gridHeight = gridBounds.bottom - gridBounds.top;
        const cellWidth = gridWidth / gridCols;
        const cellHeight = gridHeight / gridRows;

        // Draw cell dividers
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        // Vertical dividers
        for (let c = 1; c < gridCols; c++) {
            const x = gridBounds.left + c * cellWidth;
            ctx.beginPath();
            ctx.moveTo(x, gridBounds.top);
            ctx.lineTo(x, gridBounds.bottom);
            ctx.stroke();
        }

        // Horizontal dividers
        for (let r = 1; r < gridRows; r++) {
            const y = gridBounds.top + r * cellHeight;
            ctx.beginPath();
            ctx.moveTo(gridBounds.left, y);
            ctx.lineTo(gridBounds.right, y);
            ctx.stroke();
        }

        ctx.setLineDash([]);

        // 3. Highlight cell states with overlays
        if (gridState) {
            for (let r = 0; r < gridRows; r++) {
                for (let c = 0; c < gridCols; c++) {
                    const state = gridState[r]?.[c];
                    let color = null;

                    if (state === 'locked-green') color = 'rgba(0, 255, 0, 0.3)';
                    else if (state === 'locked-blue') color = 'rgba(0, 150, 255, 0.3)';
                    else if (state === 'blocked') color = 'rgba(128, 128, 128, 0.3)';

                    if (color) {
                        const x = gridBounds.left + c * cellWidth;
                        const y = gridBounds.top + r * cellHeight;
                        ctx.fillStyle = color;
                        ctx.fillRect(x, y, cellWidth, cellHeight);

                        // Label the state
                        ctx.fillStyle = '#ffffff';
                        ctx.font = '10px Arial';
                        ctx.fillText(state, x + 5, y + 15);
                    }
                }
            }
        }

        // 4. Draw requirement extraction regions
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);

        // Row requirement regions (left margin)
        const rowBarWidth = (detectionData.imageWidth / 2560) * 20;
        const rowMarginWidth = (gridCols + 1) * rowBarWidth;
        for (let r = 0; r < gridRows; r++) {
            const y = gridBounds.top + (r + 0.5) * cellHeight;
            const regionX = Math.max(0, gridBounds.left - rowMarginWidth);
            const regionY = y - cellHeight * 0.3;
            const regionHeight = cellHeight * 0.6;

            ctx.strokeRect(regionX, regionY, rowMarginWidth, regionHeight);

            // Show detected requirement
            if (requirements.rows[r]) {
                const req = requirements.rows[r];
                ctx.fillStyle = '#ffff00';
                ctx.font = 'bold 12px Arial';
                ctx.fillText(
                    `R${r}: G${req.green} B${req.blue}`,
                    regionX + 5,
                    regionY + regionHeight / 2
                );
            }
        }

        // Column requirement regions (top margin)
        const colBarHeight = (detectionData.imageHeight / 1440) * 20;
        const colMarginHeight = (gridRows + 1) * colBarHeight;
        for (let c = 0; c < gridCols; c++) {
            const x = gridBounds.left + (c + 0.5) * cellWidth;
            const regionX = x - cellWidth * 0.3;
            const regionY = Math.max(0, gridBounds.top - colMarginHeight);
            const regionWidth = cellWidth * 0.6;

            ctx.strokeRect(regionX, regionY, regionWidth, colMarginHeight);

            // Show detected requirement
            if (requirements.cols[c]) {
                const req = requirements.cols[c];
                ctx.fillStyle = '#ffff00';
                ctx.font = 'bold 12px Arial';
                ctx.save();
                ctx.translate(regionX + regionWidth / 2, regionY + 5);
                ctx.rotate(Math.PI / 2);
                ctx.fillText(`C${c}: G${req.green} B${req.blue}`, 0, 0);
                ctx.restore();
            }
        }

        ctx.setLineDash([]);

        // 5. Mark blocked rows/columns
        if (blockedRows.length > 0) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            blockedRows.forEach(r => {
                const y = gridBounds.top + r * cellHeight;
                ctx.fillRect(gridBounds.left, y, gridWidth, cellHeight);
            });
        }

        if (blockedCols.length > 0) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            blockedCols.forEach(c => {
                const x = gridBounds.left + c * cellWidth;
                ctx.fillRect(x, gridBounds.top, cellWidth, gridHeight);
            });
        }

        // 6. Draw inventory tile regions
        {
            const resScale = detectionData.imageWidth / 2560;
            const invLeft = Math.round(detectionData.imageWidth * (2045 / 2560));
            const invTop = Math.round(detectionData.imageHeight * (193 / 1440));
            const invRight = Math.round(detectionData.imageWidth * (2485 / 2560));
            const invBottom = Math.round(detectionData.imageHeight * (1290 / 1440));

            // Draw panel outline
            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(invLeft, invTop, invRight - invLeft, invBottom - invTop);
            ctx.setLineDash([]);
            ctx.fillStyle = '#ff8800';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('Inventory', invLeft + 4, invTop - 6);

            const tileW = Math.round(188 * resScale);
            const tileH = Math.round(188 * resScale);
            const colGapLeft = Math.round(23 * resScale);
            const colGapRight = Math.round(15 * resScale);
            const rowGapTop = Math.round(45 * resScale);
            const rowGap = Math.round(20 * resScale);
            const cols = [invLeft + colGapLeft, invRight - colGapRight - tileW];
            const rowStride = tileH + rowGap;
            const maxRows = Math.max(1, Math.floor((invBottom - invTop - rowGapTop + rowGap) / rowStride));

            const detectedTiles = detectionData.detectedTiles || [];

            for (let row = 0; row < maxRows; row++) {
                for (let col = 0; col < cols.length; col++) {
                    const tx = cols[col];
                    const ty = invTop + rowGapTop + row * rowStride;
                    if (ty + tileH > invBottom) continue;

                    // Draw tile outline
                    ctx.strokeStyle = '#ff8800';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(tx, ty, tileW, tileH);
                }
            }

            // Draw shape detections
            for (const tile of detectedTiles) {
                if (!tile.bbox || !tile.grid) {
                    if (tile.shapeId) {
                        ctx.fillStyle = '#ff8800';
                        ctx.font = '11px Arial';
                        ctx.fillText(tile.shapeId, tile.x + 3, tile.y + 14);
                    }
                    continue;
                }

                // Draw bounding box
                const bx = tile.x + tile.bbox.minC;
                const by = tile.y + tile.bbox.minR;
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 2]);
                ctx.strokeRect(bx, by, tile.bbox.w, tile.bbox.h);
                ctx.setLineDash([]);

                // Draw rasterized NxN grid (fixed cell sizes: 2→42px, 3→28px, 4→21px)
                // Grid origin is at bbox top-left, matching how rasterizeToGrid samples.
                const n = tile.N;
                const cs = tile.cellSize;

                for (let r = 0; r < n; r++) {
                    for (let c = 0; c < n; c++) {
                        const cx = bx + c * cs;
                        const cy = by + r * cs;

                        // Draw grid cell outline
                        ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
                        ctx.lineWidth = 0.5;
                        ctx.strokeRect(cx, cy, cs, cs);

                        // Fill if detected
                        if (tile.grid[r][c]) {
                            ctx.fillStyle = tile.shapeId ? 'rgba(57, 255, 20, 0.5)' : 'rgba(255, 0, 0, 0.5)';
                            ctx.fillRect(cx, cy, cs, cs);
                        }
                    }
                }

                // Label
                ctx.fillStyle = tile.shapeId ? '#39ff14' : '#ff3939';
                ctx.font = 'bold 12px Arial';
                ctx.fillText(tile.shapeId || 'Unknown', tile.x + 3, tile.y + 14);
            }
        }
    }

    // Update debug info text
    debugInfo.innerHTML = `
        <div class="debug-section">
            <div class="debug-section-title">Image Dimensions</div>
            <div>${image.width} x ${image.height} pixels</div>
        </div>
        
        <div class="debug-section">
            <div class="debug-section-title">Grid Detection</div>
            <div>Bounds: <span class="debug-value">(${gridBounds.left}, ${gridBounds.top}) to (${gridBounds.right}, ${gridBounds.bottom})</span></div>
            <div>Dimensions: <span class="debug-value">${gridRows} rows x ${gridCols} cols</span></div>
            <div>Grid Size: <span class="debug-value">${gridBounds.right - gridBounds.left} x ${gridBounds.bottom - gridBounds.top} px</span></div>
        </div>
        
        <div class="debug-section">
            <div class="debug-section-title">Cell States</div>
            ${generateCellStatsHTML(gridState, gridRows, gridCols)}
        </div>
        
        <div class="debug-section">
            <div class="debug-section-title">Requirements Extracted</div>
            <div style="margin-bottom: 5px;"><strong>Rows:</strong></div>
            ${requirements.rows.map((r, i) => `<div>  Row ${i}: Green=${r.green}, Blue=${r.blue}</div>`).join('')}
            <div style="margin-top: 10px; margin-bottom: 5px;"><strong>Columns:</strong></div>
            ${requirements.cols.map((c, i) => `<div>  Col ${i}: Green=${c.green}, Blue=${c.blue}</div>`).join('')}
        </div>
        
        <div class="debug-section">
            <div class="debug-section-title">Blocked Rows/Columns</div>
            <div>Blocked Rows: <span class="debug-value">${blockedRows.length > 0 ? `[${blockedRows.join(', ')}]` : 'None'}</span></div>
            <div>Blocked Cols: <span class="debug-value">${blockedCols.length > 0 ? `[${blockedCols.join(', ')}]` : 'None'}</span></div>
        </div>
        
        <div class="debug-section">
            <div class="debug-section-title">Shape Inventory</div>
            ${Object.keys(analysisResults.shapeCounts || {}).length === 0
            ? '<div class="debug-warning">No shapes detected</div>'
            : Object.entries(analysisResults.shapeCounts || {})
                .map(([id, count]) => `<div>${id}: <span class="debug-value">${count}</span></div>`)
                .join('')
        }
        </div>
        
        <div class="debug-section">
            <div class="debug-section-title">Legend</div>
            <div><span style="color: #00ff00;">■</span> Green outline: Grid bounds</div>
            <div><span style="color: #ffffff;">╌</span> White dashed: Cell dividers</div>
            <div><span style="color: #ffff00;">╌</span> Yellow dashed: Requirement regions</div>
            <div><span style="color: rgba(0,255,0,0.3);">■</span> Green overlay: Locked-green cells</div>
            <div><span style="color: rgba(0,150,255,0.3);">■</span> Blue overlay: Locked-blue cells</div>
            <div><span style="color: rgba(128,128,128,0.3);">■</span> Grey overlay: Blocked cells</div>
            <div><span style="color: rgba(255,0,0,0.2);">■</span> Red overlay: Blocked rows/cols</div>
        </div>
    `;
}

/**
 * Generate HTML for cell state statistics
 */
function generateCellStatsHTML(gridState, rows, cols) {
    if (!gridState || rows === 0 || cols === 0) {
        return '<div class="debug-warning">No grid state data</div>';
    }

    const stats = {
        'empty': 0,
        'locked-green': 0,
        'locked-blue': 0,
        'blocked': 0
    };

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const state = gridState[r]?.[c] || 'empty';
            stats[state] = (stats[state] || 0) + 1;
        }
    }

    return Object.entries(stats)
        .map(([state, count]) => `<div>${state}: <span class="debug-value">${count}</span></div>`)
        .join('');
}
