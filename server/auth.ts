import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

// Helper function to get real client IP address with enhanced production support
function getRealClientIP(req: any): string {
  // For Replit production, check Replit-specific headers first
  if (req.headers['x-replit-user-ip']) {
    return req.headers['x-replit-user-ip'];
  }
  
  // Standard proxy headers (most reliable for production)
  if (req.headers['x-forwarded-for']) {
    const forwarded = req.headers['x-forwarded-for'].split(',')[0].trim();
    if (forwarded && forwarded !== '127.0.0.1' && forwarded !== '::1') {
      return forwarded;
    }
  }
  
  if (req.headers['x-real-ip']) {
    const realIP = req.headers['x-real-ip'].trim();
    if (realIP && realIP !== '127.0.0.1' && realIP !== '::1') {
      return realIP;
    }
  }
  
  // Cloudflare and other CDN headers
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }
  
  // Express trust proxy IP
  if (req.ip && req.ip !== '127.0.0.1' && req.ip !== '::1') {
    return req.ip;
  }
  
  // Socket-level IP addresses
  const socketIP = req.connection?.remoteAddress || 
                   req.socket?.remoteAddress ||
                   req.connection?.socket?.remoteAddress;
  
  if (socketIP && socketIP !== '127.0.0.1' && socketIP !== '::1') {
    return socketIP;
  }
  
  // Default fallback
  return '127.0.0.1';
}

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// Extend session data to include loginTime
declare module 'express-session' {
  interface SessionData {
    loginTime?: string;
  }
}

async function hashPassword(password: string) {
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);
  return hash;
}

/**
 * Compare a supplied plain text password with a stored hashed password
 * Handles both bcrypt hashes and our legacy ".salt" format
 */
async function comparePasswords(supplied: string, stored: string) {
  try {
    // Try bcrypt comparison first for all bcrypt hashes
    if (stored.startsWith('$2')) {
      const isValidBcrypt = await bcrypt.compare(supplied, stored);
      if (isValidBcrypt) return true;
    }
    
    // If the password is in our fallback format (using base64 encoding with salt)
    if (stored.includes('.salt')) {
      return await storage.verifyPassword(supplied, stored);
    }
    
    // Default bcrypt comparison for regular database storage
    return await bcrypt.compare(supplied, stored);
  } catch (error) {
    console.error('Error comparing passwords:', error);
    return false;
  }
}

export function setupAuth(app: Express) {
  // Check if SESSION_SECRET is set, otherwise use a random string
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = randomBytes(64).toString('hex');
    console.warn('No SESSION_SECRET set in environment. Using a random secret which will invalidate existing sessions on restart.');
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    proxy: true, // Trust proxy for secure cookies
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      sameSite: 'lax'
    }
  };

  app.set("trust proxy", true); // Trust all proxies for Replit deployments
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({ passReqToCallback: true }, async (req, username, password, done) => {
      try {
        const ipAddress = getRealClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        console.log(`[AUTH] Login attempt for username: ${username} from IP: ${ipAddress}`);
        let user = await storage.getUserByUsername(username);
        
        if (!user) {
          console.log(`[AUTH] ❌ User not found: ${username}`);
          
          // Log failed login attempt for non-existent user
          try {
            await storage.logSecurityEvent({
              eventType: 'login_failed',
              userId: null,
              username: username,
              ipAddress: ipAddress,
              userAgent: userAgent,
              result: 'failure',
              reason: 'User not found',
              details: { authMethod: 'local', attemptedUsername: username }
            });
          } catch (logError) {
            console.error(`[AUTH] ⚠️ Failed to log security event:`, logError);
          }
          
          return done(null, false, { message: "Invalid username or password" });
        }
        
        console.log(`[AUTH] ✅ Found user: ${username}, role: ${user.role}, auth_type: ${user.authType}, checking password...`);
        const passwordMatch = await comparePasswords(password, user.password);
        console.log(`[AUTH] Password validation result for ${username}: ${passwordMatch ? '✅ SUCCESS' : '❌ FAILED'}`);
        
        if (!passwordMatch) {
          console.log(`[AUTH] ❌ Invalid password for user: ${username}`);
          
          // Track failed login attempt (non-blocking - login continues if this fails)
          try {
            await storage.updateFailedLogin(user.id, 'local', 'Invalid password');
            
            // Log to security logs
            await storage.logSecurityEvent({
              eventType: 'login_failed',
              userId: user.id,
              username: user.username,
              ipAddress: ipAddress,
              userAgent: userAgent,
              result: 'failure',
              reason: 'Invalid password',
              details: { authMethod: 'local' }
            });
          } catch (failedLoginError) {
            console.error(`[AUTH] ⚠️ Failed to track failed login for ${username}:`, failedLoginError);
          }
          
          return done(null, false, { message: "Invalid username or password" });
        }
        
        // Detect hybrid authentication: if user has 'oauth' auth type, upgrade to 'hybrid'
        if (user.authType === 'oauth') {
          console.log(`[AUTH] Converting user ${username} from 'oauth' to 'hybrid' auth type`);
          await storage.updateUserAuthType(user.id, 'hybrid');
          // Re-fetch user to get updated auth_type for session
          const updatedUser = await storage.getUser(user.id);
          if (updatedUser) {
            user = updatedUser;
          }
        }
        
        console.log(`[AUTH] ✅ Login successful for user: ${username}`);
        // Log successful serializeUser execution
        console.log(`[AUTH] ✅ About to serialize user ID: ${user.id}`);
        return done(null, user);
      } catch (err) {
        console.error(`[AUTH] ❌ Authentication error for ${username}:`, err);
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });
  
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
        role: "user", // Default role for new users
        createdAt: new Date()
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      console.error("Error during registration:", error);
      res.status(500).json({ error: "Failed to register user" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ error: info?.message || "Invalid username or password" });
      }

      req.login(user, async (err) => {
        if (err) return next(err);
        
        // Capture client IP and user agent with enhanced detection
        const clientIP = getRealClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        // Log successful login to security logs
        try {
          await storage.createSecurityLog({
            eventType: 'login',
            result: 'success',
            username: user.username,
            userId: user.id,
            ipAddress: clientIP,
            userAgent: userAgent,
            details: {
              loginMethod: 'password',
              timestamp: new Date().toISOString(),
              sessionId: req.sessionID,
              userRole: user.role,
              loginDuration: 'N/A',
              previousLoginTime: user.lastLogin ? new Date(user.lastLogin).toISOString() : 'First login',
              accountStatus: 'Active',
              authenticationSource: 'Local Database',
              securityLevel: 'Standard',
              clientDetails: {
                ipAddress: clientIP,
                userAgent: userAgent,
                acceptLanguage: req.headers['accept-language'] || 'Unknown',
                referer: req.headers['referer'] || 'Direct access',
                origin: req.headers['origin'] || req.headers['host'] || 'Unknown'
              },
              serverDetails: {
                serverId: process.env.REPLIT_DEPLOYMENT_ID || 'Development',
                environment: process.env.NODE_ENV || 'development',
                timestamp: new Date().toISOString()
              }
            }
          });
        } catch (error) {
          console.error("Error logging security event:", error);
          // Continue even if logging fails
        }
        
        // Track successful local login and session start
        try {
          await storage.updateSuccessfulLogin(user.id, 'local');
          console.log(`[AUTH] ✅ Successful local login tracked for user: ${user.username}`);
          // Store login time in session for duration tracking
          req.session.loginTime = new Date().toISOString();
        } catch (error) {
          console.error("Error updating login tracking:", error);
          // Continue even if this fails
        }
        
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", async (req, res, next) => {
    const user = req.user as SelectUser;
    const clientIP = getRealClientIP(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Log logout event before actually logging out
    if (user) {
      try {
        const sessionDuration = req.session?.loginTime ? 
          Math.round((new Date().getTime() - new Date(req.session.loginTime).getTime()) / 1000) : 0;
        
        await storage.createSecurityLog({
          eventType: 'logout',
          result: 'success',
          username: user.username,
          userId: user.id,
          ipAddress: clientIP,
          userAgent: userAgent,
          details: {
            logoutMethod: 'manual',
            timestamp: new Date().toISOString(),
            sessionId: req.sessionID,
            userRole: user.role,
            sessionDuration: sessionDuration > 0 ? 
              `${Math.floor(sessionDuration / 60)} minutes ${sessionDuration % 60} seconds` : 'Unknown',
            logoutReason: 'User initiated logout',
            accountStatus: 'Active',
            securityLevel: 'Standard',
            sessionDetails: {
              startTime: req.session?.loginTime || 'Unknown',
              endTime: new Date().toISOString(),
              totalDuration: sessionDuration,
              activityLevel: 'Normal'
            },
            clientDetails: {
              ipAddress: clientIP,
              userAgent: userAgent,
              acceptLanguage: req.headers['accept-language'] || 'Unknown',
              referer: req.headers['referer'] || 'Direct access',
              origin: req.headers['origin'] || req.headers['host'] || 'Unknown'
            },
            serverDetails: {
              serverId: process.env.REPLIT_DEPLOYMENT_ID || 'Development',
              environment: process.env.NODE_ENV || 'development',
              timestamp: new Date().toISOString()
            }
          }
        });
      } catch (error) {
        console.error("Error logging logout security event:", error);
        // Continue even if logging fails
      }
    }
    
    req.logout((err) => {
      if (err) return next(err);
      res.status(200).json({ success: true, message: "Logged out successfully" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    res.json(req.user);
  });

  app.put("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const { firstName, lastName, email, username, currentPassword, newPassword } = req.body;
      const userId = req.user!.id;

      // Validate required fields
      if (!firstName || !lastName || !email || !username) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Check if username is already taken by another user
      if (username !== req.user!.username) {
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ error: "Username already taken" });
        }
      }

      // Check if email is already taken by another user
      if (email !== req.user!.email) {
        const existingUserByEmail = await storage.getUserByEmail(email);
        if (existingUserByEmail && existingUserByEmail.id !== userId) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }

      let passwordChanged = false;

      // Handle password change if provided
      if (currentPassword && newPassword) {
        // Get current user from database to verify password
        const currentUser = await storage.getUser(userId);
        if (!currentUser || !currentUser.password) {
          return res.status(400).json({ error: "Password change not available for this account" });
        }

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, currentUser.password);
        if (!isValidPassword) {
          return res.status(400).json({ error: "Current password is incorrect" });
        }

        // Validate new password length
        if (newPassword.length < 8) {
          return res.status(400).json({ error: "New password must be at least 8 characters" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user profile (without password)
        const updatedUser = await storage.updateUser(userId, {
          firstName,
          lastName,
          email,
          username,
        });

        if (!updatedUser) {
          return res.status(404).json({ error: "User not found" });
        }

        // Update password separately using dedicated method
        await storage.updateUserPassword(userId, hashedPassword);

        // Update the session with new user data
        req.user = updatedUser;
        passwordChanged = true;

        // Exclude password from response for security
        const { password: _, ...safeUser } = updatedUser;
        res.json({ ...safeUser, passwordChanged: true });
      } else {
        // Update user profile without password change
        const updatedUser = await storage.updateUser(userId, {
          firstName,
          lastName,
          email,
          username,
        });

        if (!updatedUser) {
          return res.status(404).json({ error: "User not found" });
        }

        // Update the session with new user data
        req.user = updatedUser;

        // Exclude password from response for security
        const { password: _, ...safeUser } = updatedUser;
        res.json({ ...safeUser, passwordChanged: false });
      }
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Middleware to check if user is authenticated
  app.use("/api/protected/*", (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  });

  // Initialize Microsoft OAuth and Duo MFA (optional - only if credentials configured)
  (async () => {
    try {
      const { microsoftOAuth } = await import("./auth/microsoft-oauth");
      const { duoMFA } = await import("./auth/duo-mfa");
      
      microsoftOAuth.initialize();
      await duoMFA.initialize();
    } catch (error) {
      console.warn("[AUTH] Microsoft OAuth/Duo initialization skipped (credentials not configured):", error);
    }
  })();
}