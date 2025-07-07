require('dotenv').config();
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Initialize SQLite database
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

async function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupAdmin() {
  try {
    console.log('\n=== Marmarica TV Admin Setup ===\n');

    // Check if admin already exists
    const adminExists = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM admins', (err, row) => {
        if (err) reject(err);
        else resolve(row.count > 0);
      });
    });

    if (adminExists) {
      console.log('Warning: An admin account already exists.');
      const proceed = await question('Do you want to create another admin account? (yes/no): ');
      if (proceed.toLowerCase() !== 'yes') {
        console.log('Operation cancelled.');
        process.exit(0);
      }
    }

    // Get admin credentials
    const username = await question('Enter admin username: ');
    const password = await question('Enter admin password: ');

    if (!username || !password) {
      throw new Error('Username and password are required');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create admin
    const now = new Date().toISOString();
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO admins (username, password, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [username, hashedPassword, now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Save credentials to backup file
    const backupContent = `
Admin Credentials Backup
Created: ${now}
-------------------
Username: ${username}
Password: ${password}

IMPORTANT: 
1. Keep this file secure and delete it after first login
2. Change this password immediately after first login
3. Store these credentials safely as they cannot be recovered, only reset
`;

    const backupPath = path.join(__dirname, '..', 'admin-credentials.txt');
    fs.writeFileSync(backupPath, backupContent);

    console.log('\nAdmin account created successfully!');
    console.log(`Credentials backup saved to: ${backupPath}`);
    console.log('\nIMPORTANT: Please save these credentials and delete the backup file after first login.');

  } catch (error) {
    console.error('Error setting up admin:', error.message);
  } finally {
    rl.close();
    db.close();
  }
}

// Run setup
setupAdmin();
