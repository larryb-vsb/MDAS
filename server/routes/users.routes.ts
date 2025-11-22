import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "./middleware";

export function registerUserRoutes(app: Express) {
  // User management endpoints
  app.get("/api/users", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  
  app.post("/api/users", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const user = await storage.createUser({
        ...req.body,
        password: await storage.hashPassword(req.body.password),
        authType: req.body.authType || "local", // Default to local auth
        role: req.body.role || "user",
        createdAt: new Date()
      });
      
      // Log user creation (skip if database size limit reached)
      try {
        await storage.createAuditLog({
          entityType: "user",
          entityId: `${user.id}`,
          action: "create",
          oldValues: {},
          newValues: {
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
          },
          username: req.user?.username || "System",
          notes: `New user '${user.username}' created with role '${user.role}'`,
          timestamp: new Date()
        });
      } catch (auditError) {
        console.warn("Audit logging skipped due to database size limit:", (auditError as Error).message);
      }
      
      res.status(201).json(user);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  
  app.put("/api/users/:id", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const userId = parseInt(req.params.id);
      
      // Get original user data for audit logging
      const originalUser = await storage.getUser(userId);
      if (!originalUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Don't allow password updates through this endpoint
      const { password, ...userData } = req.body;
      
      const updatedUser = await storage.updateUser(userId, userData);
      
      // Log user update (skip if database size limit reached)
      try {
        await storage.createAuditLog({
          entityType: "user",
          entityId: `${userId}`,
          action: "update",
          oldValues: {
            username: originalUser.username,
            email: originalUser.email,
            firstName: originalUser.firstName,
            lastName: originalUser.lastName,
            role: originalUser.role
          },
          newValues: {
            username: updatedUser.username,
            email: updatedUser.email,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            role: updatedUser.role
          },
          username: req.user?.username || "System",
          notes: `User '${originalUser.username}' profile updated`,
          timestamp: new Date()
        });
      } catch (auditError) {
        console.warn("Audit logging skipped due to database size limit:", (auditError as Error).message);
      }
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Update user preferences (theme, dashboard, etc.)
  app.patch("/api/user/preferences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const updates = req.body;
      console.log(`[USER-PREFS] Updating preferences for user ${userId}:`, updates);
      
      const updatedUser = await storage.updateUser(userId, updates);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user preferences:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });
  
  app.delete("/api/users/:id", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      // Don't allow deleting your own account
      if (req.user?.id === parseInt(req.params.id)) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      const userId = parseInt(req.params.id);
      
      // Get user data before deletion for audit logging
      const userToDelete = await storage.getUser(userId);
      if (!userToDelete) {
        return res.status(404).json({ error: "User not found" });
      }
      
      await storage.deleteUser(userId);
      
      // Log user deletion
      await storage.createAuditLog({
        entityType: "user",
        entityId: `${userId}`,
        action: "delete",
        oldValues: {
          username: userToDelete.username,
          email: userToDelete.email,
          firstName: userToDelete.firstName,
          lastName: userToDelete.lastName,
          role: userToDelete.role
        },
        newValues: {},
        username: req.user?.username || "System",
        notes: `User '${userToDelete.username}' (${userToDelete.role}) was deleted`,
        timestamp: new Date()
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
  
  // Change password endpoint (admin can change any user's password, users can only change their own)
  app.post("/api/users/:id/change-password", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = parseInt(req.params.id);
      
      // Regular users can only change their own password
      if (req.user?.role !== "admin" && req.user?.id !== userId) {
        return res.status(403).json({ error: "Forbidden: You can only change your own password" });
      }
      
      // Get user data for audit logging
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // For regular users, require current password
      if (req.user?.role !== "admin" && req.user?.id === userId) {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
          return res.status(400).json({ error: "Current password and new password are required" });
        }
        
        if (!(await storage.verifyPassword(currentPassword, targetUser.password))) {
          return res.status(400).json({ error: "Current password is incorrect" });
        }
        
        await storage.updateUserPassword(userId, newPassword);
        
        // Log password change by user (skip if database size limit reached)
        try {
          await storage.createAuditLog({
            entityType: "user",
            entityId: `${userId}`,
            action: "password_change",
            oldValues: { passwordChanged: false },
            newValues: { passwordChanged: true },
            username: req.user?.username || "System",
            notes: `User '${targetUser.username}' changed their own password`,
            timestamp: new Date()
          });
        } catch (auditError) {
          console.warn("Audit logging skipped due to database size limit:", (auditError as Error).message);
        }
        
        return res.json({ success: true });
      } else {
        // Admin can change password without knowing current password
        const { newPassword } = req.body;
        if (!newPassword) {
          return res.status(400).json({ error: "New password is required" });
        }
        
        await storage.updateUserPassword(userId, newPassword);
        
        // Log admin password reset (skip if database size limit reached)
        try {
          await storage.createAuditLog({
            entityType: "user",
            entityId: `${userId}`,
            action: "password_reset",
            oldValues: { passwordChanged: false },
            newValues: { passwordChanged: true },
            username: req.user?.username || "System",
            notes: `Admin '${req.user?.username}' reset password for user '${targetUser.username}'`,
            timestamp: new Date()
          });
        } catch (auditError) {
          console.warn("Audit logging skipped due to database size limit:", (auditError as Error).message);
        }
        
        return res.json({ success: true });
      }
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });
}
