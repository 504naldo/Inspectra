import { z } from 'zod';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq, and, or, like, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { adminProcedure, protectedProcedure, router } from './_core/trpc';

export const userRouter = router({
  // List all users in company (admin only)
  listUsers: adminProcedure
    .input(z.object({
      companyId: z.number(),
      search: z.string().optional(),
      role: z.enum(['admin', 'office', 'technician', 'customer']).optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const { companyId, search, role, isActive } = input;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      let conditions = [eq(users.companyId, companyId)];
      
      if (search) {
        conditions.push(
          or(
            like(users.name, `%${search}%`),
            like(users.email, `%${search}%`)
          )!
        );
      }
      
      if (role) {
        conditions.push(eq(users.role, role));
      }
      
      if (isActive !== undefined) {
        conditions.push(eq(users.isActive, isActive ? 1 : 0));
      }
      
      const userList = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(and(...conditions))
        .orderBy(users.createdAt);
      
      return userList;
    }),

  // Update user (admin only)
  updateUser: adminProcedure
    .input(z.object({
      userId: z.number(),
      name: z.string().optional(),
      role: z.enum(['admin', 'office', 'technician', 'customer']).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { userId, name, role, isActive } = input;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Get user to verify they're in the same company
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }
      
      if (user.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot update users from other companies' });
      }
      
      // Build update object
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (role !== undefined) updates.role = role;
      if (isActive !== undefined) updates.isActive = isActive;
      
      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No updates provided' });
      }
      
      await db
        .update(users)
        .set(updates)
        .where(eq(users.id, userId));
      
      return { success: true };
    }),

  // Merge duplicate users (admin only)
  mergeUsers: adminProcedure
    .input(z.object({
      keepUserId: z.number(),
      deleteUserId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { keepUserId, deleteUserId } = input;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      if (keepUserId === deleteUserId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot merge user with itself' });
      }
      
      // Get both users to verify they're in the same company
      const [keepUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, keepUserId))
        .limit(1);
      
      const [deleteUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, deleteUserId))
        .limit(1);
      
      if (!keepUser || !deleteUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'One or both users not found' });
      }
      
      if (keepUser.companyId !== ctx.user.companyId || deleteUser.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot merge users from other companies' });
      }
      
      // Update foreign keys to point to keepUserId
      // job_assignments
      await db.execute(sql`
        UPDATE job_assignments 
        SET userId = ${keepUserId}
        WHERE userId = ${deleteUserId}
        AND NOT EXISTS (
          SELECT 1 FROM job_assignments 
          WHERE jobId = job_assignments.jobId 
          AND userId = ${keepUserId}
        )
      `);
      
      // Delete remaining job_assignments for deleteUserId (duplicates)
      await db.execute(sql`
        DELETE FROM job_assignments 
        WHERE userId = ${deleteUserId}
      `);
      
      // jobs.assignedTechnicianId (legacy field)
      await db.execute(sql`
        UPDATE jobs 
        SET assignedTechnicianId = ${keepUserId}
        WHERE assignedTechnicianId = ${deleteUserId}
      `);
      
      // Delete the duplicate user
      await db
        .delete(users)
        .where(eq(users.id, deleteUserId));
      
      return { success: true };
    }),
});
