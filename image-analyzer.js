/**
 * Originium Circuitry Image Analyzer
 * 
 * Extracts puzzle data from Arknights Endfield screenshots:
 * - Grid dimensions and cell states
 * - Row/column requirements
 * - Shape inventory
 * - Blocked rows/columns
 */



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
        const rowMarginWidth = Math.min(100, gridBounds.left - 20);
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
        const colMarginHeight = Math.min(100, gridBounds.top - 20);
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
