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

      // Check if we need to create or find this user in our database
      let user = await storage.getUserByUsername(userProfile.email);

      if (!user) {
        // Create new user from Microsoft account
        logger.info(`[MICROSOFT-AUTH] Creating new user for: ${userProfile.email}`);
        
        try {
          user = await storage.createUser({
            username: userProfile.email,
            password: '', // No password for OAuth users
            authType: 'oauth', // OAuth authentication
            role: 'user', // Default role, can be changed by admin
          });
          logger.info(`[MICROSOFT-AUTH] ✅ New user created: ${userProfile.email}`);
        } catch (createError) {
          logger.error('[MICROSOFT-AUTH] Failed to create user:', createError);
          return res.redirect('/?error=user_creation_failed');
        }
      }

      // Store Microsoft profile in session
      req.session.microsoftProfile = userProfile;

      // Log in the user with passport
      req.login(user, (err) => {
        if (err) {
          logger.error('[MICROSOFT-AUTH] Passport login failed:', err);
          return res.redirect('/?error=session_creation_failed');
        }

        logger.info(`[MICROSOFT-AUTH] ✅ User logged in: ${user!.username}`);

        // If Duo is enabled, redirect to Duo MFA
        if (duoMFA.isEnabled()) {
          logger.info('[MICROSOFT-AUTH] Redirecting to Duo MFA');
          return res.redirect('/auth/duo');
        }

        // No Duo configured, go directly to dashboard
        logger.info('[MICROSOFT-AUTH] No Duo MFA - authentication complete');
        res.redirect('/');
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
