const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Connect to database
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Generate a random password
function generatePassword(length = 12) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

// Save credentials to file
function saveCredentials(username, password) {
  const content = `Admin Credentials\n----------------\nUsername: ${username}\nPassword: ${password}\n\nPlease change this password after first login.\nGenerated at: ${new Date().toISOString()}`;
  const filePath = path.join(__dirname, '..', 'admin-credentials.txt');
  fs.writeFileSync(filePath, content);
  console.log(`Credentials saved to: ${filePath}`);
}

// Create or update admin user
async function manageAdmin(username, password = null) {
  // Generate password if not provided
  const finalPassword = password || generatePassword();
  
  // Hash password
  const hashedPassword = await bcrypt.hash(finalPassword, 10);
  const now = new Date().toISOString();

  // Try to create new admin
  db.run(`INSERT INTO admins (username, password, created_at, updated_at) 
          VALUES (?, ?, ?, ?)
          ON CONFLICT(username) 
          DO UPDATE SET password = ?, updated_at = ?`,
    [username, hashedPassword, now, now, hashedPassword, now],
    (err) => {
      if (err) {
        console.error('Error managing admin:', err.message);
        process.exit(1);
      }
      
      console.log(`Admin user '${username}' created/updated successfully`);
      
      if (!password) {
        saveCredentials(username, finalPassword);
      }
      
      // Close database connection
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        }
        process.exit(0);
      });
    }
  );
}

// Parse command line arguments
const args = process.argv.slice(2);
const usage = `
Usage:
  Create/reset admin with random password:
    node manage-admin.js create <username>
  
  Set specific password:
    node manage-admin.js set-password <username> <password>
`;

if (args.length < 2) {
  console.log(usage);
  process.exit(1);
}

const [action, username, password] = args;

switch (action) {
  case 'create':
    manageAdmin(username);
    break;
  case 'set-password':
    if (!password) {
      console.log('Password is required for set-password action');
      console.log(usage);
      process.exit(1);
    }
    manageAdmin(username, password);
    break;
  default:
    console.log(`Unknown action: ${action}`);
    console.log(usage);
    process.exit(1);
}
