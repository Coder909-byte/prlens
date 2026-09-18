/*
  Warnings:

  - Added the required column `primaryLlmModel` to the `Review` table without a default value. This is not possible if the table is not empty.
  - Added the required column `primaryLlmProvider` to the `Review` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "primaryLlmModel" TEXT NOT NULL,
ADD COLUMN     "primaryLlmProvider" TEXT NOT NULL;
