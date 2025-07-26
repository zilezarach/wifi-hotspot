/*
  Warnings:

  - Added the required column `planName` to the `Session` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "dataCap" INTEGER,
ADD COLUMN     "planName" TEXT NOT NULL;
