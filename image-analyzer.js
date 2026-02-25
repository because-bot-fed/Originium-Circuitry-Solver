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
async function analyzePuzzleImage(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // 1. Detect Grid Bounds
    const gridBounds = detectGridBounds(canvas);
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
    const shapeCounts = detectInventory(imageData, gridBounds, image.width, image.height);

    return {
        gridRows,
        gridCols,
        gridState,
        requirements,
        shapeCounts,
        blockedRows,
        blockedCols,
        _debug: {
            gridBounds,
            imageWidth: image.width,
            imageHeight: image.height
        }
    };
}

/**
 * Find the grid boundaries by searching for the corner brackets.
 * Uses a hardcoded search area (580, 145) to (1980, 1300) scaled from 2560x1440.
 */
function detectGridBounds(srcImage) {
    // 1. Read the main image and the template images
    let src = cv.imread(srcImage);
    let topLeftCornerTempl = cv.imread('corner_top_left');
    let bottomRightCornerTempl = cv.imread('corner_bottom_right');
    let dst = new cv.Mat();
    let result = new cv.Mat();

    // Convert both to grayscale to ignore minor color shifts
    let srcGray = new cv.Mat();
    let topLeftCornerTemplGray = new cv.Mat();
    let bottomRightCornerTemplGray = new cv.Mat();
    cv.cvtColor(src, srcGray, cv.COLOR_RGBA2GRAY, 0);
    cv.cvtColor(topLeftCornerTempl, topLeftCornerTemplGray, cv.COLOR_RGBA2GRAY, 0);
    cv.cvtColor(bottomRightCornerTempl, bottomRightCornerTemplGray, cv.COLOR_RGBA2GRAY, 0);

    // 2. Perform Template Matching for top-left corner
    cv.matchTemplate(srcGray, topLeftCornerTemplGray, result, cv.TM_CCOEFF_NORMED);

    // 3. Find the best match location for top-left corner
    let minMax = cv.minMaxLoc(result);
    let maxPoint = minMax.maxLoc;
    let confidence = minMax.maxVal;
    let topLeftCorner = { x: maxPoint.x + topLeftCornerTempl.cols, y: maxPoint.y + topLeftCornerTempl.rows };

    // 4. Verify the match for top-left corner
    if (confidence > 0.85) {
        console.log(`Top-left corner found at X: ${maxPoint.x}, Y: ${maxPoint.y} with ${(confidence * 100).toFixed(2)}% confidence.`);
    } else {
        throw new Error("Corner bracket not found. Highest confidence was only: " + confidence);
    }

    // 5. Perform Template Matching for bottom-right corner
    cv.matchTemplate(srcGray, bottomRightCornerTemplGray, result, cv.TM_CCOEFF_NORMED);

    // 6. Find the best match location for bottom-right corner
    minMax = cv.minMaxLoc(result);
    maxPoint = minMax.maxLoc;
    confidence = minMax.maxVal;
    let bottomRightCorner = { x: maxPoint.x, y: maxPoint.y };

    // 7. Verify the match for bottom-right corner
    if (confidence > 0.85) {
        console.log(`Bottom-right corner found at X: ${maxPoint.x}, Y: ${maxPoint.y} with ${(confidence * 100).toFixed(2)}% confidence.`);
    } else {
        throw new Error("Corner bracket not found. Highest confidence was only: " + confidence);
    }

    // 8. Clean up memory
    src.delete(); topLeftCornerTempl.delete(); dst.delete(); result.delete();
    srcGray.delete(); topLeftCornerTemplGray.delete(); bottomRightCornerTemplGray.delete();

    return {
        left: topLeftCorner.x,
        top: topLeftCorner.y,
        right: bottomRightCorner.x,
        bottom: bottomRightCorner.y
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

function extractRequirements(imageData, gridBounds, rows, cols) {
    return {
        rows: new Array(rows).fill(0).map(() => ({ green: 0, blue: 0 })),
        cols: new Array(cols).fill(0).map(() => ({ green: 0, blue: 0 }))
    };
}

function detectBlockedRowsCols(imageData, gridBounds, rows, cols) {
    return { blockedRows: [], blockedCols: [] };
}

function detectInventory(imageData, gridBounds, width, height) {
    return {};
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
