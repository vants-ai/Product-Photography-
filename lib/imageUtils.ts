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
 * Resizes an image to a maximum size, preserving its aspect ratio.
 * This function no longer pads the image to a specific aspect ratio.
 * @param imageDataUrl The data URL of the source image.
 * @param size The target size for the longest dimension of the image (e.g., 1024).
 * @param aspectRatio The target aspect ratio (no longer used for padding).
 * @returns A promise that resolves to an object containing the new data URL and original dimensions.
 */
export async function prepareImage(imageDataUrl: string, size: number = 1024, aspectRatio: string = '1:1'): Promise<PreparedImage> {
    const img = await loadImage(imageDataUrl);
    const canvas = document.createElement('canvas');

    const { naturalWidth, naturalHeight } = img;
    const ratio = Math.min(size / naturalWidth, size / naturalHeight);

    canvas.width = naturalWidth * ratio;
    canvas.height = naturalHeight * ratio;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return {
        preparedDataUrl: canvas.toDataURL('image/png'),
        originalWidth: naturalWidth,
        originalHeight: naturalHeight,
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