import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import crypto from "crypto";
import nodemailer from "nodemailer";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export function issueToken(uid: string) {
  return jwt.sign({ uid }, JWT_SECRET, { expiresIn: "30d" });
}

function extractToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7).trim();
  const q = req.query?.token;
  if (typeof q === "string" && q.length > 0) return q;
  return null;
}

export function authRequired() {
  return (req: any, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: "missing token" });
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { uid: string };
      req.user = { id: payload.uid };
      next();
    } catch {
      return res.status(401).json({ error: "invalid token" });
    }
  };
}

export async function hashPassword(pw: string) {
  return argon2.hash(pw, { type: argon2.argon2id });
}
export async function verifyPassword(hash: string, pw: string) {
  return argon2.verify(hash, pw);
}

export function makeToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export async function sendMail(to: string, subject: string, html: string) {
  if (!process.env.SMTP_HOST) {
    console.log("=== DEV MAIL ===\nTo:", to, "\nSub:", subject, "\nHTML:", html, "\n===============");
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  await transporter.sendMail({ from: `Dreamshell <no-reply@dreamshell>`, to, subject, html });
}

export async function ensurePersonaFor(pool: any, userId: string) {
  const traits = { curiosity: 0.6, empathy: 0.7, rigor: 0.6, mystique: 0.7, challengeRate: 0.35 };
  await pool.query(
    `INSERT INTO persona (user_id, version, traits, last_updated)
     VALUES ($1, 1, $2::jsonb, $3::timestamptz)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, JSON.stringify(traits), new Date().toISOString()]
  );
}
