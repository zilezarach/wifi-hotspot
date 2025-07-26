-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "mac" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "planHours" INTEGER NOT NULL,
    "expiry" TIMESTAMP(3) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
