import { authenticate } from "@google-cloud/local-auth";
import { google, Auth } from "googleapis";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { configHome } from "./core/env.js";

export const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
];

// Credentials directory: explicit env var, else the fixed config home
// (so the CLI resolves creds independent of the current directory).
const CREDS_DIR = process.env.GDRIVE_CREDS_DIR || configHome();

const credentialsPath = path.join(CREDS_DIR, ".gdrive-server-credentials.json");
const keyfilePath = path.join(CREDS_DIR, "gcp-oauth.keys.json");

/**
 * Singleton AuthManager - handles all authentication with caching and locking
 */
class AuthManager {
  private static instance: AuthManager;
  private authClient: Auth.OAuth2Client | null = null;
  private refreshLock: Promise<Auth.OAuth2Client | null> | null = null;
  private tokenExpiryDate: Date | null = null;
  
  // Buffer time before expiry to trigger refresh (5 minutes)
  private static readonly EXPIRY_BUFFER_MS = 5 * 60 * 1000;
  
  private constructor() {}
  
  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }
  
  /**
   * Get valid auth client - uses cache when possible
   * This is the main entry point for getting auth
   */
  async getAuth(forceRefresh = false): Promise<Auth.OAuth2Client | null> {
    // Fast path: return cached client if valid
    if (!forceRefresh && this.authClient && !this.isExpiringSoon()) {
      return this.authClient;
    }
    
    // Need to refresh - use lock to prevent concurrent refreshes
    return this.refreshWithLock();
  }
  
  /**
   * Get auth quietly (no interactive prompts) - for background operations
   */
  async getAuthQuietly(): Promise<Auth.OAuth2Client | null> {
    // Fast path: return cached client if valid
    if (this.authClient && !this.isExpiringSoon()) {
      return this.authClient;
    }
    
    // Try to load from file without prompting
    return this.loadCredentialsQuietly();
  }
  
  /**
   * Check if token is expiring soon
   */
  private isExpiringSoon(): boolean {
    if (!this.tokenExpiryDate) return true;
    const timeToExpiry = this.tokenExpiryDate.getTime() - Date.now();
    return timeToExpiry < AuthManager.EXPIRY_BUFFER_MS;
  }
  
  /**
   * Refresh auth with lock to prevent concurrent refreshes
   */
  private async refreshWithLock(): Promise<Auth.OAuth2Client | null> {
    // If refresh is already in progress, wait for it
    if (this.refreshLock) {
      return this.refreshLock;
    }
    
    // Start refresh with lock
    this.refreshLock = this.doRefresh();
    
    try {
      return await this.refreshLock;
    } finally {
      this.refreshLock = null;
    }
  }
  
  /**
   * Actual refresh logic
   */
  private async doRefresh(): Promise<Auth.OAuth2Client | null> {
    // First try to load existing credentials
    const quietAuth = await this.loadCredentialsQuietly();
    if (quietAuth) {
      return quietAuth;
    }
    
    // No valid credentials - need interactive auth
    return this.authenticateInteractively();
  }
  
  /**
   * Load credentials from file without prompting
   */
  private async loadCredentialsQuietly(): Promise<Auth.OAuth2Client | null> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
    );
    
    // Check if credentials file exists
    if (!fsSync.existsSync(credentialsPath)) {
      console.error("[Auth] No credentials file found");
      return null;
    }
    
    try {
      const savedCredsJson = await fs.readFile(credentialsPath, "utf-8");
      const savedCreds = JSON.parse(savedCredsJson);
      oauth2Client.setCredentials(savedCreds);
      
      const expiryDate = new Date(savedCreds.expiry_date);
      const timeToExpiry = expiryDate.getTime() - Date.now();
      
      // If token is expiring soon and we have refresh token, refresh it
      if (timeToExpiry < AuthManager.EXPIRY_BUFFER_MS && savedCreds.refresh_token) {
        console.error("[Auth] Token expiring soon, refreshing...");
        try {
          const response = await oauth2Client.refreshAccessToken();
          const newCreds = response.credentials;
          
          await this.saveCredentials(newCreds);
          oauth2Client.setCredentials(newCreds);
          
          this.tokenExpiryDate = new Date(newCreds.expiry_date!);
          console.error("[Auth] Token refreshed successfully");
        } catch (error) {
          console.error("[Auth] Failed to refresh token:", error);
          return null;
        }
      } else {
        this.tokenExpiryDate = expiryDate;
      }
      
      // Cache the client
      this.authClient = oauth2Client;
      return oauth2Client;
      
    } catch (error) {
      console.error("[Auth] Error loading credentials:", error);
      return null;
    }
  }
  
  /**
   * Interactive authentication flow
   */
  private async authenticateInteractively(): Promise<Auth.OAuth2Client | null> {
    console.error("[Auth] Starting interactive authentication...");
    
    try {
      const auth = await this.authenticateWithTimeout(keyfilePath, SCOPES, 30000);
      if (!auth) {
        console.error("[Auth] Authentication timed out or failed");
        return null;
      }
      
      // Refresh to get a refresh token
      try {
        const { credentials } = await auth.refreshAccessToken();
        await this.saveCredentials(credentials);
        auth.setCredentials(credentials);
        
        this.tokenExpiryDate = new Date(credentials.expiry_date!);
        this.authClient = auth;
        
        console.error("[Auth] Authentication successful");
        return auth;
      } catch (error) {
        console.error("[Auth] Error refreshing token during auth:", error);
        return auth;
      }
    } catch (error) {
      console.error("[Auth] Authentication error:", error);
      return null;
    }
  }
  
  /**
   * Authenticate with timeout
   */
  private async authenticateWithTimeout(
    keyfilePath: string,
    scopes: string[],
    timeoutMs: number,
  ): Promise<Auth.OAuth2Client | null> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        console.error("[Auth] Authentication timed out");
        resolve(null);
      }, timeoutMs);
    });

    const authPromise = authenticate({
      keyfilePath,
      scopes,
    });

    try {
      return await Promise.race([authPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }
  
  /**
   * Save credentials to file (async)
   */
  private async saveCredentials(credentials: Auth.Credentials): Promise<void> {
    await this.ensureCredsDirectory();
    await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2));
  }
  
  /**
   * Ensure credentials directory exists
   */
  private async ensureCredsDirectory(): Promise<void> {
    try {
      await fs.mkdir(CREDS_DIR, { recursive: true });
    } catch (error) {
      console.error("[Auth] Failed to create credentials directory:", error);
      throw error;
    }
  }
  
  /**
   * Clear cached auth (for testing or forced re-auth)
   */
  clearCache(): void {
    this.authClient = null;
    this.tokenExpiryDate = null;
  }
}

// Export singleton instance methods
const authManager = AuthManager.getInstance();

/**
 * Get valid credentials, prompting for auth if necessary
 * @throws Error if authentication fails
 */
export async function getValidCredentials(forceAuth = false): Promise<Auth.OAuth2Client> {
  const auth = await authManager.getAuth(forceAuth);
  if (!auth) {
    throw new Error("Failed to obtain valid credentials");
  }
  google.options({ auth });
  return auth;
}

/**
 * Load credentials without prompting for auth
 */
export async function loadCredentialsQuietly(): Promise<Auth.OAuth2Client | null> {
  const auth = await authManager.getAuthQuietly();
  if (auth) {
    google.options({ auth });
  }
  return auth;
}

/**
 * Setup periodic token refresh
 * Only refreshes if token is actually expiring
 */
export function setupTokenRefresh(): NodeJS.Timeout {
  console.error("[Auth] Setting up automatic token refresh (every 45 minutes)");
  
  return setInterval(async () => {
    try {
      // This will only refresh if needed (uses cache otherwise)
      const auth = await authManager.getAuthQuietly();
      if (auth) {
        google.options({ auth });
      }
    } catch (error) {
      console.error("[Auth] Error in automatic token refresh:", error);
    }
  }, 45 * 60 * 1000);
}
