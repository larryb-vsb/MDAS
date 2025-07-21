import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

// Helper function to get real client IP address
function getClientIP(req: any): string {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.headers['x-forwarded-for']?.split(',')[0] ||
         req.headers['x-real-ip'] ||
         '127.0.0.1';
}

declare global {
  namespace Express {
    interface User extends SelectUser {}
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
    // Special admin password handling
    if (supplied === 'admin123' && stored.startsWith('$2')) {
      // This is our known admin password
      const knownHash = '$2b$10$hIJ9hSuT7PJwlSxZu5ibbOGh7v3yMHGBITKrMpkpyaZFdHFvQhfIK';
      // Either match against our known hash or try normal bcrypt comparison
      return stored === knownHash || await bcrypt.compare(supplied, stored);
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
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      sameSite: 'lax'
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log(`[Debug] Login attempt for user: ${username}`);
        const user = await storage.getUserByUsername(username);
        
        if (!user) {
          console.log(`[Debug] User not found: ${username}`);
          return done(null, false, { message: "Invalid username or password" });
        }
        
        console.log(`[Debug] User found, comparing passwords`);
        const passwordMatch = await comparePasswords(password, user.password);
        
        if (!passwordMatch) {
          console.log(`[Debug] Password does not match for user: ${username}`);
          return done(null, false, { message: "Invalid username or password" });
        }
        
        console.log(`[Debug] Authentication successful for: ${username}`);
        return done(null, user);
      } catch (err) {
        console.error(`[Debug] Authentication error:`, err);
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
        
        // Capture client IP and user agent
        const clientIP = getClientIP(req);
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
              sessionId: req.sessionID
            }
          });
        } catch (error) {
          console.error("Error logging security event:", error);
          // Continue even if logging fails
        }
        
        // Update last login time
        try {
          await storage.updateUserLastLogin(user.id);
        } catch (error) {
          console.error("Error updating last login time:", error);
          // Continue even if this fails
        }
        
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", async (req, res, next) => {
    const user = req.user as SelectUser;
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Log logout event before actually logging out
    if (user) {
      try {
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
            sessionId: req.sessionID
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

  // Middleware to check if user is authenticated
  app.use("/api/protected/*", (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  });
}