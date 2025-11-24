import type { Express } from "express";
import { microsoftOAuth } from "../auth/microsoft-oauth";
import { duoMFA } from "../auth/duo-mfa";
import { logger } from "../../shared/logger";
import { storage } from "../storage";

/**
 * Microsoft OAuth + Duo MFA Authentication Routes
 * 
 * Flow:
 * 1. User clicks "Sign in with Microsoft" → /auth/microsoft
 * 2. Microsoft redirects back → /auth/microsoft/callback
 * 3. Redirect to Duo MFA → /auth/duo
 * 4. Duo redirects back → /auth/duo/callback
 * 5. User is fully authenticated → /dashboard
 */

export function registerMicrosoftAuthRoutes(app: Express) {
  
  /**
   * Step 1: Initiate Microsoft OAuth login
   * GET /auth/microsoft
   */
  app.get("/auth/microsoft", async (req, res) => {
    try {
      if (!microsoftOAuth.isEnabled()) {
        logger.error('[MICROSOFT-AUTH] Microsoft OAuth not configured');
        return res.status(503).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Service Unavailable</title></head>
          <body>
            <h2>Microsoft Login Not Available</h2>
            <p>Microsoft authentication is not configured on this server.</p>
            <p><a href="/">Back to Login</a></p>
          </body>
          </html>
        `);
      }

      const authUrl = await microsoftOAuth.getAuthUrl(req);
      
      if (!authUrl) {
        throw new Error('Failed to generate Microsoft auth URL');
      }

      logger.info('[MICROSOFT-AUTH] Redirecting user to Microsoft login');
      res.redirect(authUrl);
    } catch (error) {
      logger.error('[MICROSOFT-AUTH] Error initiating OAuth:', error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body>
          <h2>Authentication Error</h2>
          <p>Unable to connect to Microsoft login service.</p>
          <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <p><a href="/">Back to Login</a></p>
        </body>
        </html>
      `);
    }
  });

  /**
   * Step 2: Handle Microsoft OAuth callback
   * GET /auth/microsoft/callback
   */
  app.get("/auth/microsoft/callback", async (req, res) => {
    try {
      const { code, error, error_description } = req.query;

      // Check for OAuth errors
      if (error) {
        logger.error(`[MICROSOFT-AUTH] OAuth error: ${error} - ${error_description}`);
        return res.redirect(`/?error=microsoft_auth_failed&details=${encodeURIComponent(error_description as string || error as string)}`);
      }

      if (!code || typeof code !== 'string') {
        logger.error('[MICROSOFT-AUTH] No authorization code received');
        return res.redirect('/?error=no_auth_code');
      }

      // Exchange code for user profile
      logger.info('[MICROSOFT-AUTH] Processing callback with authorization code');
      const userProfile = await microsoftOAuth.handleCallback(code);

      if (!userProfile) {
        logger.error('[MICROSOFT-AUTH] Failed to get user profile');
        return res.redirect('/?error=profile_fetch_failed');
      }

      // Store Microsoft profile in session for email confirmation
      req.session.microsoftProfile = userProfile;
      
      logger.info(`[MICROSOFT-AUTH] Microsoft authentication successful, redirecting to email confirmation`);
      
      // Save session before redirect to ensure data persists
      req.session.save((err) => {
        if (err) {
          logger.error('[MICROSOFT-AUTH] Failed to save session:', err);
          return res.redirect('/?error=session_save_failed');
        }
        
        logger.info('[MICROSOFT-AUTH] Session saved, redirecting to email confirmation page');
        // Redirect to email confirmation page
        res.redirect('/auth/microsoft/confirm-email');
      });

    } catch (error) {
      logger.error('[MICROSOFT-AUTH] Callback error:', error);
      res.redirect(`/?error=callback_failed&details=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  });

  /**
   * Step 3: Show Duo MFA challenge page
   * GET /auth/duo
   */
  app.get("/auth/duo", async (req, res) => {
    try {
      if (!req.user) {
        logger.warn('[DUO-AUTH] No user in session');
        return res.redirect('/');
      }

      if (!duoMFA.isEnabled()) {
        logger.warn('[DUO-AUTH] Duo not configured - skipping MFA');
        return res.redirect('/');
      }

      const user = req.user as any;
      const microsoftProfile = req.session.microsoftProfile;

      if (!microsoftProfile?.msftAuthenticated) {
        logger.warn('[DUO-AUTH] Microsoft authentication not complete');
        return res.redirect('/auth/microsoft');
      }

      // Check if already Duo authenticated
      if (microsoftProfile.duoAuthenticated) {
        logger.info('[DUO-AUTH] User already Duo authenticated');
        return res.redirect('/');
      }

      // Generate Duo auth URL
      const username = user.username;
      const sessionId = req.session.id || '';

      logger.info(`[DUO-AUTH] Generating Duo auth URL for: ${username}`);
      const duoAuthUrl = await duoMFA.createAuthUrl(username, sessionId);

      if (!duoAuthUrl) {
        throw new Error('Failed to generate Duo auth URL');
      }

      logger.info('[DUO-AUTH] Redirecting user to Duo Universal Prompt');
      res.redirect(duoAuthUrl);

    } catch (error) {
      logger.error('[DUO-AUTH] Error showing Duo challenge:', error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body>
          <h2>Multi-Factor Authentication Error</h2>
          <p>Unable to initialize Duo MFA.</p>
          <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <p><a href="/">Back to Home</a></p>
        </body>
        </html>
      `);
    }
  });

  /**
   * Step 4: Handle Duo MFA callback
   * GET /auth/duo/callback
   */
  app.get("/auth/duo/callback", async (req, res) => {
    try {
      const { duo_code, state } = req.query;

      if (!duo_code || typeof duo_code !== 'string') {
        logger.error('[DUO-AUTH] No Duo code received');
        return res.redirect('/?error=duo_no_code');
      }

      if (!req.user) {
        logger.error('[DUO-AUTH] No user in session during callback');
        return res.redirect('/?error=duo_no_session');
      }

      const user = req.user as any;
      const username = user.username;

      logger.info(`[DUO-AUTH] Processing Duo callback for: ${username}`);
      const isAuthenticated = await duoMFA.exchangeAuthorizationCode(duo_code, username);

      if (!isAuthenticated) {
        logger.error('[DUO-AUTH] Duo authentication failed');
        return res.redirect('/?error=duo_auth_failed');
      }

      // Mark user as Duo authenticated in session
      if (req.session.microsoftProfile) {
        req.session.microsoftProfile.duoAuthenticated = true;
      }

      logger.info(`[DUO-AUTH] ✅ Complete authentication successful for: ${username}`);
      
      // Redirect to dashboard - fully authenticated!
      res.redirect('/');

    } catch (error) {
      logger.error('[DUO-AUTH] Callback error:', error);
      res.redirect(`/?error=duo_callback_failed&details=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  });

  /**
   * Email confirmation page - renders the email confirmation UI
   * GET /auth/microsoft/confirm-email
   */
  app.get("/auth/microsoft/confirm-email", (req, res) => {
    logger.info('[MICROSOFT-AUTH] GET /auth/microsoft/confirm-email accessed');
    logger.info('[MICROSOFT-AUTH] Session ID:', req.sessionID);
    logger.info('[MICROSOFT-AUTH] Has microsoftProfile:', !!req.session.microsoftProfile);
    
    if (!req.session.microsoftProfile) {
      logger.error('[MICROSOFT-AUTH] No Microsoft profile in session - redirecting to login with error');
      return res.redirect('/?error=no_microsoft_session');
    }

    logger.info('[MICROSOFT-AUTH] Microsoft profile found, doing direct redirect to login with confirmation flag');
    // Direct server-side redirect
    res.redirect('/?confirm_microsoft_email=true');
  });

  /**
   * Handle email confirmation submission
   * POST /auth/microsoft/confirm-email
   */
  app.post("/auth/microsoft/confirm-email", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!req.session.microsoftProfile) {
        logger.error('[MICROSOFT-AUTH] No Microsoft profile in session');
        return res.status(401).json({ error: 'No Microsoft session found' });
      }

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      logger.info(`[MICROSOFT-AUTH] Email confirmation for: ${email}`);

      // Check if user exists by email
      let user = await storage.getUserByEmail(email);

      if (user) {
        // User exists - link Microsoft account to existing account
        logger.info(`[MICROSOFT-AUTH] Found existing user for email ${email} (username: ${user.username})`);
      } else {
        // Create new OAuth user
        logger.info(`[MICROSOFT-AUTH] Creating new OAuth user for: ${email}`);
        
        try {
          user = await storage.createUser({
            username: email,
            email: email,
            password: '', // No password for OAuth users
            authType: 'oauth',
            role: 'user',
          });
          logger.info(`[MICROSOFT-AUTH] ✅ New OAuth user created: ${email}`);
        } catch (createError) {
          logger.error('[MICROSOFT-AUTH] Failed to create user:', createError);
          return res.status(500).json({ error: 'Failed to create user account' });
        }
      }

      // Log in the user with passport
      req.login(user, (err) => {
        if (err) {
          logger.error('[MICROSOFT-AUTH] Passport login failed:', err);
          return res.status(500).json({ error: 'Failed to create session' });
        }

        logger.info(`[MICROSOFT-AUTH] ✅ User logged in: ${user!.username}`);

        // Clear the Microsoft profile from session
        delete req.session.microsoftProfile;

        // Save session after login to ensure it persists
        req.session.save((saveErr) => {
          if (saveErr) {
            logger.error('[MICROSOFT-AUTH] Failed to save session after login:', saveErr);
            return res.status(500).json({ error: 'Failed to save session' });
          }

          // If Duo is enabled, return that info
          if (duoMFA.isEnabled()) {
            logger.info('[MICROSOFT-AUTH] Duo MFA required');
            return res.json({ success: true, requiresDuo: true, redirectTo: '/auth/duo' });
          }

          // No Duo configured, authentication complete
          logger.info('[MICROSOFT-AUTH] Authentication complete');
          res.json({ success: true, requiresDuo: false, redirectTo: '/' });
        });
      });

    } catch (error) {
      logger.error('[MICROSOFT-AUTH] Email confirmation error:', error);
      res.status(500).json({ error: 'Email confirmation failed' });
    }
  });

  /**
   * Get Microsoft profile from session
   * GET /api/auth/microsoft/profile
   */
  app.get("/api/auth/microsoft/profile", (req, res) => {
    if (!req.session.microsoftProfile) {
      return res.status(404).json({ error: 'No Microsoft profile in session' });
    }
    
    res.json({
      email: req.session.microsoftProfile.email,
      name: req.session.microsoftProfile.name,
    });
  });

  /**
   * Check Microsoft OAuth status endpoint
   * GET /api/auth/microsoft/status
   */
  app.get("/api/auth/microsoft/status", (req, res) => {
    res.json({
      microsoftEnabled: microsoftOAuth.isEnabled(),
      duoEnabled: duoMFA.isEnabled(),
    });
  });

  logger.info('[MICROSOFT-AUTH] Routes registered');
}

// Extend session to include Microsoft profile
declare module 'express-session' {
  interface SessionData {
    microsoftProfile?: {
      id: string;
      email: string;
      name: string;
      tenantId: string;
      msftAuthenticated: boolean;
      duoAuthenticated: boolean;
    };
  }
}
