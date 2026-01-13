import { ConfidentialClientApplication, type Configuration } from "@azure/msal-node";
import type { Request, Response } from "express";
import { logger } from "../../shared/logger";
import { NODE_ENV } from "../env-config";

/**
 * Microsoft OAuth Configuration using MSAL (Microsoft Authentication Library)
 * This handles the OAuth 2.0 flow for "Sign in with Microsoft" button
 */

interface MicrosoftConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
}

export class MicrosoftOAuthService {
  private msalClient: ConfidentialClientApplication | null = null;
  private config: MicrosoftConfig | null = null;

  /**
   * Initialize Microsoft OAuth with credentials from environment
   */
  initialize() {
    try {
      const clientId = process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;
      const tenantId = process.env.AZURE_TENANT_ID || 'common'; // 'common' allows any Microsoft account
      
      if (!clientId || !clientSecret) {
        logger.warn('[MICROSOFT-OAUTH] Azure credentials not configured - Microsoft login disabled');
        return false;
      }

      // Build redirect URI based on environment with comprehensive logging
      logger.info('[MICROSOFT-OAUTH] 🔍 Environment Detection:');
      logger.info(`[MICROSOFT-OAUTH]   NODE_ENV: ${NODE_ENV}`);
      logger.info(`[MICROSOFT-OAUTH]   REPLIT_DEPLOYMENT: ${process.env.REPLIT_DEPLOYMENT || 'not set'}`);
      logger.info(`[MICROSOFT-OAUTH]   REPLIT_DEV_DOMAIN: ${process.env.REPLIT_DEV_DOMAIN || 'not set'}`);
      
      let baseUrl: string;
      
      if (NODE_ENV === 'production') {
        // Production: use the published domain
        baseUrl = 'https://mms-vsb.replit.app';
        logger.info('[MICROSOFT-OAUTH] 🚀 Production mode - using published domain');
      } else if (process.env.REPLIT_DEV_DOMAIN) {
        // Development on Replit
        baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
        logger.info('[MICROSOFT-OAUTH] 🛠️  Development mode - using Replit dev domain');
      } else {
        // Local development
        baseUrl = 'http://localhost:5000';
        logger.info('[MICROSOFT-OAUTH] 💻 Local development - using localhost');
      }
      
      const redirectUri = `${baseUrl}/auth/microsoft/callback`;
      logger.info(`[MICROSOFT-OAUTH] ✅ Redirect URI configured: ${redirectUri}`);

      this.config = {
        clientId,
        clientSecret,
        tenantId,
        redirectUri
      };

      const msalConfig: Configuration = {
        auth: {
          clientId: this.config.clientId,
          authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
          clientSecret: this.config.clientSecret,
        },
        system: {
          loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
              if (!containsPii) {
                logger.info(`[MSAL] ${message}`);
              }
            },
            piiLoggingEnabled: false,
            logLevel: 3, // Error level
          }
        }
      };

      this.msalClient = new ConfidentialClientApplication(msalConfig);
      logger.info('[MICROSOFT-OAUTH] ✅ Initialized successfully');
      logger.info(`[MICROSOFT-OAUTH] Redirect URI: ${redirectUri}`);
      return true;
    } catch (error) {
      logger.error('[MICROSOFT-OAUTH] ❌ Initialization failed:', error);
      return false;
    }
  }

  /**
   * Check if Microsoft OAuth is enabled and configured
   */
  isEnabled(): boolean {
    return this.msalClient !== null && this.config !== null;
  }

  /**
   * Get the authorization URL to redirect user to Microsoft login
   */
  async getAuthUrl(req: Request): Promise<string | null> {
    if (!this.msalClient || !this.config) {
      logger.error('[MICROSOFT-OAUTH] Not initialized - cannot generate auth URL');
      return null;
    }

    try {
      const authCodeUrlParameters = {
        scopes: ['openid', 'profile', 'email', 'User.Read'],
        redirectUri: this.config.redirectUri,
        state: req.session?.id || 'random-state', // CSRF protection
      };

      const authUrl = await this.msalClient.getAuthCodeUrl(authCodeUrlParameters);
      logger.info('[MICROSOFT-OAUTH] Generated auth URL for user');
      return authUrl;
    } catch (error) {
      logger.error('[MICROSOFT-OAUTH] Failed to generate auth URL:', error);
      return null;
    }
  }

  /**
   * Handle the callback from Microsoft with authorization code
   * Returns user profile if successful
   */
  async handleCallback(code: string): Promise<MicrosoftUserProfile | null> {
    if (!this.msalClient || !this.config) {
      logger.error('[MICROSOFT-OAUTH] Not initialized - cannot handle callback');
      return null;
    }

    try {
      const tokenRequest = {
        code,
        scopes: ['openid', 'profile', 'email', 'User.Read'],
        redirectUri: this.config.redirectUri,
      };

      logger.info('[MICROSOFT-OAUTH] Exchanging authorization code for token');
      logger.info(`[MICROSOFT-OAUTH] Using redirect URI: ${this.config.redirectUri}`);
      const response = await this.msalClient.acquireTokenByCode(tokenRequest);

      if (!response || !response.account) {
        logger.error('[MICROSOFT-OAUTH] ❌ No account info in token response');
        logger.error('[MICROSOFT-OAUTH] Response status: No account data returned');
        return null;
      }

      const account = response.account;
      
      const userProfile: MicrosoftUserProfile = {
        id: account.localAccountId || account.homeAccountId,
        email: account.username, // In Microsoft, username is the email
        name: account.name || account.username,
        tenantId: account.tenantId || '',
        msftAuthenticated: true,
        duoAuthenticated: false, // Will be set to true after Duo MFA
      };

      logger.info(`[MICROSOFT-OAUTH] ✅ User authenticated: ${userProfile.email}`);
      return userProfile;
    } catch (error) {
      logger.error('[MICROSOFT-OAUTH] ❌ Token exchange failed:', error);
      if (error instanceof Error) {
        logger.error(`[MICROSOFT-OAUTH] Error details: ${error.message}`);
        logger.error(`[MICROSOFT-OAUTH] Error stack: ${error.stack}`);
      }
      logger.error(`[MICROSOFT-OAUTH] Config at time of error - Redirect URI: ${this.config.redirectUri}`);
      return null;
    }
  }
}

export interface MicrosoftUserProfile {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  msftAuthenticated: boolean;
  duoAuthenticated: boolean;
}

// Singleton instance
export const microsoftOAuth = new MicrosoftOAuthService();
