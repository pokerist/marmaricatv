const fs = require('fs');
const path = require('path');

// Function to create an empty image file with the correct PNG header
function createEmptyPNG(filepath, size) {
  // Create a simple 1x1 PNG file
  // This is not a proper PNG but will prevent browser errors
  // PNG header (minimal format)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR length
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // width: 1 pixel
    0x00, 0x00, 0x00, 0x01, // height: 1 pixel
    0x08, // bit depth: 8
    0x02, // color type: 2 (RGB)
    0x00, // compression: 0
    0x00, // filter: 0
    0x00, // interlace: 0
    0x00, 0x00, 0x00, 0x00, // CRC placeholder
    // IDAT chunk with minimal data
    0x00, 0x00, 0x00, 0x0C, // IDAT length
    0x49, 0x44, 0x41, 0x54, // "IDAT"
    0x08, 0x1D, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, // Minimal zlib data
    0x00, 0x00, 0x00, 0x00, // CRC placeholder
    // IEND chunk
    0x00, 0x00, 0x00, 0x00, // IEND length
    0x49, 0x45, 0x4E, 0x44, // "IEND"
    0xAE, 0x42, 0x60, 0x82  // IEND CRC
  ]);
  
  fs.writeFileSync(filepath, pngData);
  console.log(`Created empty ${size}x${size} PNG at ${filepath}`);
}

// Function to create an empty ICO file
function createEmptyICO(filepath) {
  // ICO header with minimal data
  const icoData = Buffer.from([
    0x00, 0x00, // Reserved
    0x01, 0x00, // Type: 1 = ICO
    0x01, 0x00, // Count: 1 icon
    
    // Icon directory entry
    0x10, 0x10, // Width, height (16x16)
    0x00,       // Color count (0 = 256)
    0x00,       // Reserved
    0x01, 0x00, // Color planes
    0x20, 0x00, // Bits per pixel
    0x20, 0x00, 0x00, 0x00, // Size of image data
    0x16, 0x00, 0x00, 0x00, // Offset of image data
    
    // Bitmap header (simplified)
    0x28, 0x00, 0x00, 0x00, // Header size
    0x10, 0x00, 0x00, 0x00, // Width
    0x20, 0x00, 0x00, 0x00, // Height (doubled for ICO)
    0x01, 0x00,             // Planes
    0x20, 0x00,             // Bits per pixel
    0x00, 0x00, 0x00, 0x00, // Compression
    0x00, 0x00, 0x00, 0x00, // Image size
    0x00, 0x00, 0x00, 0x00, // X pixels per meter
    0x00, 0x00, 0x00, 0x00, // Y pixels per meter
    0x00, 0x00, 0x00, 0x00, // Colors used
    0x00, 0x00, 0x00, 0x00, // Important colors
    
    // Minimal pixel data (blue pixel)
    0x00, 0x00, 0xFF, 0xFF  // BGRA (blue with alpha)
  ]);
  
  fs.writeFileSync(filepath, icoData);
  console.log(`Created empty ICO at ${filepath}`);
}

// Create the necessary files
const clientPublicDir = path.join(__dirname, '..', 'client', 'public');

try {
  // Create icons
  createEmptyPNG(path.join(clientPublicDir, 'logo192.png'), 192);
  createEmptyPNG(path.join(clientPublicDir, 'logo512.png'), 512);
  createEmptyICO(path.join(clientPublicDir, 'favicon.ico'));
  
  console.log('Logo files created successfully!');
} catch (err) {
  console.error('Error creating icon files:', err);
}
