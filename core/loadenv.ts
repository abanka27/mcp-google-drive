/**
 * Side-effect module: loads .env at import time.
 *
 * Import this FIRST (before any module that reads process.env at evaluation
 * time, e.g. auth.ts). ES import statements are evaluated before body
 * statements, so a plain `loadEnv()` call in a module body would run too late.
 */
import { loadEnv } from "./env.js";

loadEnv();
