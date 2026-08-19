-- CreateEnum
CREATE TYPE "language" AS ENUM ('RU', 'EN', 'PL');

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "language" "language" NOT NULL DEFAULT 'EN';
