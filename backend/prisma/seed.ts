import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const prisma = new PrismaClient();
const nodeEnv = process.env.NODE_ENV || "development";

function getRequiredEnv(name: string, fallback?: string) {
  const value = process.env[name]?.trim();
  if (value) return value;

  if (nodeEnv === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

async function main() {
  const superadminEmail = getRequiredEnv("SUPERADMIN_EMAIL", "superadmin@csc.local").toLowerCase();
  const superadminPassword = getRequiredEnv("SUPERADMIN_PASSWORD", nodeEnv === "production" ? undefined : "superadmin123");
  const superadminName = getRequiredEnv("SUPERADMIN_NAME", "SUPERADMIN");
  const defaultOrderTypes = [
    "COMPRA DE MATERIAL",
    "CONTRATACAO DE SERVICO",
    "LOCACAO DE EQUIPAMENTOS",
    "OUTROS"
  ];

  const passwordHash = await bcrypt.hash(superadminPassword, 10);

  await prisma.user.upsert({
    where: { email: superadminEmail },
    update: {
      passwordHash,
      name: superadminName,
      role: UserRole.SUPERADMIN,
      isActive: true,
    },
    create: {
      email: superadminEmail,
      passwordHash,
      name: superadminName,
      role: UserRole.SUPERADMIN,
      isActive: true,
    }
  });

  for (const [index, name] of defaultOrderTypes.entries()) {
    await prisma.orderType.upsert({
      where: { name },
      update: { sortOrder: index, isActive: true },
      create: { name, sortOrder: index, isActive: true }
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
