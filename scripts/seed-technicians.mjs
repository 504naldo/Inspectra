import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const technicians = [
  { name: 'Chris Young', email: 'chris@ewandf.ca', openId: 'tech-chris-young' },
  { name: 'Pat McKinney', email: 'pat@ewandf.ca', openId: 'tech-pat-mckinney' },
  { name: 'Russ', email: 'russ@ewandf.ca', openId: 'tech-russ' },
  { name: 'Markus', email: 'markus@ewandf.ca', openId: 'tech-markus' },
  { name: 'Tony', email: 'tony@ewandf.ca', openId: 'tech-tony' },
];

async function seedTechnicians() {
  console.log('Connecting to database...');
  const connection = await mysql.createConnection(DATABASE_URL);

  console.log('Seeding technician users...');
  
  for (const tech of technicians) {
    try {
      // Check if user already exists
      const [existing] = await connection.query(
        'SELECT id, email, role, isActive FROM users WHERE email = ?',
        [tech.email]
      );

      if (existing && existing.length > 0) {
        console.log(`✓ User ${tech.name} (${tech.email}) already exists`);
        
        // Update to ensure they're active technicians
        await connection.query(
          'UPDATE users SET role = ?, isActive = 1, name = ? WHERE email = ?',
          ['technician', tech.name, tech.email]
        );
        console.log(`  Updated to active technician`);
      } else {
        // Insert new user
        await connection.query(
          `INSERT INTO users (openId, name, email, role, isActive, companyId, createdAt, updatedAt, lastSignedIn) 
           VALUES (?, ?, ?, 'technician', 1, 1, NOW(), NOW(), NOW())`,
          [tech.openId, tech.name, tech.email]
        );
        console.log(`✓ Created user ${tech.name} (${tech.email})`);
      }
    } catch (error) {
      console.error(`✗ Error processing ${tech.name}:`, error.message);
    }
  }

  await connection.end();
  console.log('\nSeeding complete!');
}

seedTechnicians().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
