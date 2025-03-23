const fs = require('fs');
const path = require('path');

// Function to create a very simple PNG file (1x1 pixel, blue)
function createSimplePNG(filepath) {
  // PNG file signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk (13 bytes of data + 12 bytes of chunk info)
  const ihdrLength = Buffer.alloc(4);
  ihdrLength.writeUInt32BE(13, 0);
  const ihdrType = Buffer.from('IHDR');
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0); // width = 1
  ihdrData.writeUInt32BE(1, 4); // height = 1
  ihdrData.writeUInt8(8, 8);    // bit depth = 8
  ihdrData.writeUInt8(2, 9);    // color type = 2 (RGB)
  ihdrData.writeUInt8(0, 10);   // compression = 0
  ihdrData.writeUInt8(0, 11);   // filter = 0
  ihdrData.writeUInt8(0, 12);   // interlace = 0
  
  // Calculate CRC32 for IHDR chunk
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeInt32BE(0x0BD0E726, 0); // Precalculated CRC-32 for our IHDR data
  
  // IDAT chunk (image data)
  const idatLength = Buffer.alloc(4);
  idatLength.writeUInt32BE(11, 0);
  const idatType = Buffer.from('IDAT');
  const idatData = Buffer.from([
    0x78, 0x9C, 0x63, 0x60, 0x80, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01
  ]);
  
  // Calculate CRC32 for IDAT chunk
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeInt32BE(0xD3E688E6, 0); // Precalculated CRC-32 for our IDAT data
  
  // IEND chunk (end of file)
  const iendLength = Buffer.alloc(4);
  iendLength.writeUInt32BE(0, 0);
  const iendType = Buffer.from('IEND');
  const iendCrc = Buffer.alloc(4);
  iendCrc.writeInt32BE(0xAE426082, 0); // Precalculated CRC-32 for IEND
  
  // Combine all parts to create a complete PNG file
  const pngFile = Buffer.concat([
    signature,
    ihdrLength, ihdrType, ihdrData, ihdrCrc,
    idatLength, idatType, idatData, idatCrc,
    iendLength, iendType, iendCrc
  ]);
  
  // Write the buffer to file
  fs.writeFileSync(filepath, pngFile);
  console.log(`PNG file created at ${filepath}`);
}

// Create favicon.ico
function createFavicon(filepath) {
  // Very minimal .ico file with a blue 16x16 pixel
  const iconData = Buffer.from([
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10, 0x00, 0x00, 0x01, 0x00,
    0x20, 0x00, 0x68, 0x04, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00, 0x28, 0x00,
    0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x0D, 0x6E, 0xFD, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    // Followed by image data...
  ]);
  
  // Write the buffer to file
  fs.writeFileSync(filepath, iconData);
  console.log(`Icon file created at ${filepath}`);
}

// Generate the logo files
const clientPublicDir = path.join(__dirname, '..', 'client', 'public');

// Create the necessary files
createSimplePNG(path.join(clientPublicDir, 'logo192.png'));
createSimplePNG(path.join(clientPublicDir, 'logo512.png'));
createFavicon(path.join(clientPublicDir, 'favicon.ico'));

console.log('Logo generation complete!');
