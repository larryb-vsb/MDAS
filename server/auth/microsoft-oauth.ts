import { ConfidentialClientApplication, type Configuration } from "@azure/msal-node";
import type { Request, Response } from "express";
import { logger } from "../../shared/logger";

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

      // Build redirect URI based on environment
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : 'http://localhost:5000';
      const redirectUri = `${baseUrl}/auth/microsoft/callback`;

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
                logger.debug(`[MSAL] ${message}`);
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
  getAuthUrl(req: Request): string | null {
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

      const authUrl = this.msalClient.getAuthCodeUrl(authCodeUrlParameters);
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
      const response = await this.msalClient.acquireTokenByCode(tokenRequest);

      if (!response || !response.account) {
        logger.error('[MICROSOFT-OAUTH] No account info in token response');
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
