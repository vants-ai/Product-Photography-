/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// --- TYPE DEFINITIONS ---
interface PreparedImage {
    preparedDataUrl: string;
    originalWidth: number;
    originalHeight: number;
}

// --- HELPER FUNCTIONS ---
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error(`Failed to load image: ${src.substring(0, 50)}...`));
        img.src = src;
    });
}

/**
 * Converts a data URL string into a Blob object.
 * @param dataUrl The data URL to convert.
 * @returns A Blob object representing the image data.
 */
export function dataURLtoBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error('Invalid data URL');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error('Could not find MIME type in data URL');
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

/**
 * Resizes and pads an image to a specific aspect ratio.
 * @param imageDataUrl The data URL of the source image.
 * @param size The target size for the longest dimension of the canvas (e.g., 1024).
 * @param aspectRatio The target aspect ratio in "W:H" format (e.g., '16:9').
 * @returns A promise that resolves to an object containing the new data URL and original dimensions.
 */
export async function prepareImage(imageDataUrl: string, size: number = 1024, aspectRatio: string = '1:1'): Promise<PreparedImage> {
    const img = await loadImage(imageDataUrl);
    const canvas = document.createElement('canvas');

    const parts = aspectRatio.split(':').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1]) || parts[0] <= 0 || parts[1] <= 0) {
        console.error(`Invalid aspect ratio format: "${aspectRatio}". Defaulting to 1:1.`);
        parts[0] = 1;
        parts[1] = 1;
    }
    const [arW, arH] = parts;
    const ratioValue = arW / arH;

    if (ratioValue >= 1) { // Landscape or square
        canvas.width = size;
        canvas.height = Math.round(size / ratioValue);
    } else { // Portrait
        canvas.height = size;
        canvas.width = Math.round(size * ratioValue);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    ctx.fillStyle = '#000000'; // Black padding
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const ratio = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const width = img.naturalWidth * ratio;
    const height = img.naturalHeight * ratio;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    ctx.drawImage(img, x, y, width, height);

    return {
        preparedDataUrl: canvas.toDataURL('image/png'),
        originalWidth: img.naturalWidth,
        originalHeight: img.naturalHeight,
    };
}

/**
 * Crops a square image back to its original aspect ratio.
 * @param squareImageDataUrl The data URL of the square, AI-generated image.
 * @param originalWidth The width of the original user-uploaded image.
 * @param originalHeight The height of the original user-uploaded image.
 * @returns A promise that resolves to the cropped image data URL.
 */
export async function cropImage(squareImageDataUrl: string, originalWidth: number, originalHeight: number): Promise<string> {
    const img = await loadImage(squareImageDataUrl);
    const originalAspectRatio = originalWidth / originalHeight;
    
    let sx, sy, sWidth, sHeight;
    
    if (originalAspectRatio > 1) { // Landscape
        sWidth = img.naturalWidth;
        sHeight = img.naturalWidth / originalAspectRatio;
        sx = 0;
        sy = (img.naturalHeight - sHeight) / 2;
    } else { // Portrait or square
        sHeight = img.naturalHeight;
        sWidth = img.naturalHeight * originalAspectRatio;
        sy = 0;
        sx = (img.naturalWidth - sWidth) / 2;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = sWidth;
    canvas.height = sHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

    // Check mime type of input data url to preserve format (especially PNG transparency)
    const mimeTypeMatch = squareImageDataUrl.match(/^data:(image\/png);/);
    if (mimeTypeMatch) {
        return canvas.toDataURL('image/png');
    }

    return canvas.toDataURL('image/jpeg', 0.9); // Default to JPEG for smaller file size
}