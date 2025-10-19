import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

import { prisma } from "../lib/prisma";

export async function ensureUserByEmail(email: string) {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    throw Object.assign(new Error("User email is required"), { statusCode: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: trimmed } });
  if (existing) {
    return existing.email;
  }

  const passwordSeed = randomBytes(32).toString("hex");
  const hashed = await bcrypt.hash(passwordSeed, 10);

  await prisma.user.create({
    data: {
      email: trimmed,
      password: hashed,
      name: trimmed.split("@")[0] ?? null,
    },
  });

  return trimmed;
}
