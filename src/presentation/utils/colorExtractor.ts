/**
 * Extracts the dominant vibrant color from an image data URL
 * by drawing it to a small canvas and skipping neutral colors (white/grey/black background).
 */
export function extractDominantColor(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve('#00d4ff'); // default fallback for SSR
      return;
    }
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = dataUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('#00d4ff');
          return;
        }
        // Draw image down to 8x8 pixels to get averaged colors
        canvas.width = 8;
        canvas.height = 8;
        ctx.drawImage(img, 0, 0, 8, 8);
        
        const imageData = ctx.getImageData(0, 0, 8, 8).data;
        
        // Count colors, ignoring white/light grey and black/dark grey (backgrounds)
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        
        // Also track overall average color of all pixels (including neutral ones) as a fallback
        let overallR = 0, overallG = 0, overallB = 0, overallCount = 0;
        
        // Also let's find the pixel with the highest saturation to get the actual product color!
        let bestColor = '';
        let maxSaturation = -1;
        
        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          const a = imageData[i + 3];
          
          if (a < 50) continue; // transparent
          
          overallR += r;
          overallG += g;
          overallB += b;
          overallCount++;
          
          // Calculate saturation: max(r,g,b) - min(r,g,b)
          const maxVal = Math.max(r, g, b);
          const minVal = Math.min(r, g, b);
          
          // Skip neutral colors (white/grey/black have low difference between max and min)
          if (maxVal - minVal < 25) continue; 
          
          const saturation = (maxVal - minVal) / (maxVal || 1);
          if (saturation > maxSaturation) {
            maxSaturation = saturation;
            
            // Convert to hex
            const toHex = (c: number) => c.toString(16).padStart(2, '0');
            bestColor = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
          }
          
          rSum += r;
          gSum += g;
          bSum += b;
          count++;
        }
        
        const toHex = (c: number) => c.toString(16).padStart(2, '0');
        
        if (maxSaturation > 0.15 && bestColor) {
          resolve(bestColor);
        } else if (count > 0) {
          // Average color if no high saturation color found
          const rAvg = Math.round(rSum / count);
          const gAvg = Math.round(gSum / count);
          const bAvg = Math.round(bSum / count);
          resolve(`#${toHex(rAvg)}${toHex(gAvg)}${toHex(bAvg)}`);
        } else if (overallCount > 0) {
          // Overall average color (excellent fallback for silver/grey/white products)
          const rAvg = Math.round(overallR / overallCount);
          const gAvg = Math.round(overallG / overallCount);
          const bAvg = Math.round(overallB / overallCount);
          resolve(`#${toHex(rAvg)}${toHex(gAvg)}${toHex(bAvg)}`);
        } else {
          resolve('#00d4ff'); // final fallback
        }
      } catch (err) {
        console.error('Error extracting color:', err);
        resolve('#00d4ff');
      }
    };
    img.onerror = () => {
      resolve('#00d4ff');
    };
  });
}
