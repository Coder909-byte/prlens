-- CreateEnum
CREATE TYPE "ReviewMode" AS ENUM ('DIFF_ONLY', 'REPO_AWARE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('BUG', 'SECURITY', 'MISSING_TEST', 'STYLE');

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "pullNumber" INTEGER NOT NULL,
    "headSha" TEXT NOT NULL,
    "baseSha" TEXT NOT NULL,
    "mode" "ReviewMode" NOT NULL DEFAULT 'DIFF_ONLY',
    "status" "ReviewStatus" NOT NULL,
    "llmProvider" TEXT NOT NULL,
    "llmModel" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,6),
    "latencyMs" INTEGER NOT NULL,
    "skippedFiles" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "explanation" TEXT NOT NULL,
    "suggestedFix" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "postedInline" BOOLEAN NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_owner_repo_pullNumber_idx" ON "Review"("owner", "repo", "pullNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Review_owner_repo_pullNumber_headSha_key" ON "Review"("owner", "repo", "pullNumber", "headSha");

-- CreateIndex
CREATE INDEX "Finding_reviewId_idx" ON "Finding"("reviewId");

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
