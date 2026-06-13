import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function getUserId(req: Request): string {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("No userId in authenticated request");
  return userId;
}
