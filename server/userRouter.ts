import { z } from 'zod';
import { getDb, incrementUserSessionVersion, updateUser } from './db';
import { users } from '../drizzle/schema';
import { eq, and, or, like, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { adminProcedure, protectedProcedure, router } from './_core/trpc';
import { randomUUID } from 'crypto';
import { sendPortalInvite } from './emailService';
import { ENV } from './_core/env';

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
          certNumber: users.certNumber,
          certificationLevel: users.certificationLevel,
          certExpiry: users.certExpiry,
          customerOrgId: users.customerOrgId,
          isOnCall: users.isOnCall,
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
      certNumber: z.string().max(64).optional().nullable(),
      certificationLevel: z.string().max(128).optional().nullable(),
      certExpiry: z.string().optional().nullable(), // ISO date string YYYY-MM-DD
      customerOrgId: z.number().optional().nullable(),
      isOnCall: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { userId, name, role, isActive, certNumber, certificationLevel, certExpiry, customerOrgId, isOnCall } = input;
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
      if (certNumber !== undefined) updates.certNumber = certNumber;
      if (certificationLevel !== undefined) updates.certificationLevel = certificationLevel;
      if (certExpiry !== undefined) {
        // Convert ISO string to Date or null for the date column
        updates.certExpiry = certExpiry ? new Date(certExpiry) : null;
      }
      if (customerOrgId !== undefined) updates.customerOrgId = customerOrgId;
      if (isOnCall !== undefined) updates.isOnCall = isOnCall;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No updates provided' });
      }

      await db
        .update(users)
        .set(updates)
        .where(eq(users.id, userId));

      // Instantly revoke all active sessions when an account is deactivated.
      if (isActive === false) {
        await incrementUserSessionVersion(userId);
      }

      return { success: true };
    }),

  // Pre-register a new user (admin only)
  // Creates a placeholder record; when the user signs in with Google their email
  // is matched and the placeholder openId is replaced with the real one.
  createUser: adminProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().min(1),
      role: z.enum(['admin', 'office', 'technician', 'customer']),
      customerOrgId: z.number().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Prevent duplicate emails
      const existing = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'A user with this email already exists' });
      }

      const placeholderOpenId = `pending_${randomUUID()}`;
      await db.insert(users).values({
        openId: placeholderOpenId,
        email: input.email,
        name: input.name,
        role: input.role,
        companyId: ctx.user.companyId,
        customerOrgId: input.customerOrgId ?? null,
        isActive: 1,
        lastSignedIn: new Date(),
      });

      if (input.role === 'customer') {
        void sendPortalInvite({
          email: input.email,
          name: input.name,
          portalUrl: `${ENV.appUrl}/customer`,
        });
      }

      return { success: true };
    }),

  // Merge duplicate users (admin only)
  deleteUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot delete your own account' });
      }

      const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if (target.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete users from another company' });
      }

      // Remove job assignments
      await db.execute(sql`DELETE FROM job_assignments WHERE userId = ${input.userId}`);
      // Nullify legacy assignedTechnicianId and leadTechnicianId references
      await db.execute(sql`UPDATE jobs SET assignedTechnicianId = NULL WHERE assignedTechnicianId = ${input.userId}`);
      await db.execute(sql`UPDATE jobs SET leadTechnicianId = NULL WHERE leadTechnicianId = ${input.userId}`);

      await db.delete(users).where(eq(users.id, input.userId));
      return { success: true };
    }),

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

  registerPushToken: protectedProcedure
    .input(z.object({
      token: z.string().min(1),
      platform: z.enum(["ios", "android"]),
    }))
    .mutation(async ({ input, ctx }) => {
      await updateUser(ctx.user.id, {
        pushToken: input.token,
        pushPlatform: input.platform,
      } as any);
      return { success: true };
    }),
});
