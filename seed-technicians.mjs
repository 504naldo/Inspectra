import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { users } from './drizzle/schema.js';
import { eq } from 'drizzle-orm';

const technicians = [
  { email: 'chris@ewandf.ca', displayName: 'Chris Young', role: 'TECH' },
  { email: 'pat@ewandf.ca', displayName: 'Pat McKinney', role: 'TECH' },
  { email: 'russ@ewandf.ca', displayName: 'Russ', role: 'TECH' },
  { email: 'markus@ewandf.ca', displayName: 'Markus', role: 'TECH' },
  { email: 'tony@ewandf.ca', displayName: 'Tony', role: 'TECH' },
];

async function seedTechnicians() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection);

  console.log('🌱 Seeding technician users...');

  for (const tech of technicians) {
    try {
      // Check if user exists
      const existing = await db.select().from(users).where(eq(users.email, tech.email)).limit(1);

      if (existing.length > 0) {
        // Update existing user
        await db.update(users)
          .set({
            displayName: tech.displayName,
            role: tech.role,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(users.email, tech.email));
        console.log(`✅ Updated: ${tech.displayName} (${tech.email})`);
      } else {
        // Insert new user
        await db.insert(users).values({
          email: tech.email,
          displayName: tech.displayName,
          role: tech.role,
          isActive: true,
          companyId: 1, // Default company
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`✨ Created: ${tech.displayName} (${tech.email})`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${tech.email}:`, error.message);
    }
  }

  console.log('✅ Technician seeding complete!');
  await connection.end();
}

seedTechnicians().catch(console.error);
