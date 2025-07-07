const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateSecureSecret() {
  // Generate a 64-character random string
  return crypto.randomBytes(32).toString('hex');
}

function updateEnvFile(secret) {
  const envPath = path.join(__dirname, '..', '.env.production');
  
  try {
    // Read the current content
    let content = fs.readFileSync(envPath, 'utf8');
    
    // Replace the JWT_SECRET line
    content = content.replace(
      /JWT_SECRET=.*/,
      `JWT_SECRET=${secret}`
    );
    
    // Write back to file
    fs.writeFileSync(envPath, content);
    
    console.log('\nJWT secret updated successfully in .env.production');
    console.log('\nIMPORTANT: Keep this secret secure and do not share it!');
    console.log('The new JWT secret is:', secret);
    
    // Create a backup file with the secret
    const backupContent = `
JWT Secret Backup
Generated: ${new Date().toISOString()}
-------------------
JWT_SECRET=${secret}

IMPORTANT: 
1. Keep this file secure and do not share it
2. Store this secret in a secure password manager
3. Delete this file after storing the secret securely
`;
    
    const backupPath = path.join(__dirname, '..', 'jwt-secret-backup.txt');
    fs.writeFileSync(backupPath, backupContent);
    console.log(`\nBackup saved to: ${backupPath}`);
    
  } catch (error) {
    console.error('Error updating .env.production file:', error.message);
    process.exit(1);
  }
}

// Generate and update
const newSecret = generateSecureSecret();
updateEnvFile(newSecret);
