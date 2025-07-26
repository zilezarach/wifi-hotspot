import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { initiateStkPush } from "../services/mpesaService";
import { grantAccess } from "../services/accessService";
import logger from "../utils/logger";

const prisma = new PrismaClient();

const PLANS = [
  {
    id: "quick-surf",
    name: "Quick Surf",
    hours: 1,
    price: 10,
    dataCap: null,
    description: "1 Hour (Unlimited Data)",
  },
  {
    id: "daily-boost",
    name: "Daily Boost",
    hours: 24,
    price: 50,
    dataCap: 5000,
    description: "24 Hours (5GB Data Cap)",
  },
  {
    id: "family-share",
    name: "Family Share",
    hours: 24,
    price: 80,
    dataCap: 10000,
    description: "24 Hours (10GB Shared Data)",
  },
  {
    id: "weekly-unlimited",
    name: "Weekly Unlimited",
    hours: 168,
    price: 200,
    dataCap: null,
    description: "7 Days (Unlimited Data, up to 5Mbps)",
  },
  {
    id: "community-freebie",
    name: "Community Freebie",
    hours: 0.5,
    price: 0,
    dataCap: null,
    description: "30 Minutes/Day (Essentials Only)",
  },
];

export async function showPortal(req: Request, res: Response) {
  res.sendFile("index.html", { root: "public" });
}

export async function initiatePayment(
  req: Request<unknown, unknown, { planId: string; phone?: string }>,
  res: Response
) {
  const { planId, phone } = req.body;
  if (!planId) {
    return res.status(400).json({ error: "Missing planId" });
  }

  const selectedPlan = PLANS.find((p) => p.id === planId);
  if (!selectedPlan) {
    return res.status(400).json({ error: "Invalid plan selected" });
  }

  const userIp = req.ip ?? "unknown";
  const userMac = "00:00:00:00:00:00";

  const expiry = new Date(Date.now() + selectedPlan.hours * 60 * 60 * 1000);

  if (selectedPlan.price === 0) {
    try {
      await prisma.session.create({
        data: {
          mac: userMac,
          ip: userIp,
          planName: selectedPlan.name,
          planHours: selectedPlan.hours,
          dataCap: selectedPlan.dataCap,
          expiry,
          paid: true,
        },
      });
      await grantAccess(userIp);
      return res.json({ message: "Free access granted for 30 minutes!" });
    } catch (error) {
      logger.error("Free plan error:", error);
      return res.status(500).json({ error: "Server error" });
    }
  } else {
    if (!phone) {
      return res.status(400).json({ error: "Phone required for paid plans" });
    }

    try {
      const stkResponse = await initiateStkPush(phone, selectedPlan.price);
      if (stkResponse.ResponseCode === "0") {
        const checkoutRequestId = stkResponse.CheckoutRequestID;
        await prisma.session.create({
          data: {
            mac: userMac,
            ip: userIp,
            planName: selectedPlan.name,
            planHours: selectedPlan.hours,
            dataCap: selectedPlan.dataCap,
            expiry,
            paid: false,
            checkoutRequestId,
          },
        });
        res.json({ message: "Payment request sent. Complete on your phone." });
      } else {
        res.status(500).json({ error: "Payment initiation failed" });
      }
    } catch (error) {
      logger.error("Payment initiation error:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
}

export async function mpesaCallback(req: Request, res: Response) {
  const data = req.body.Body.stkCallback;
  const checkoutRequestId = data.CheckoutRequestID;

  if (data.ResultCode === 0) {
    const session = await prisma.session.findFirst({
      where: {
        checkoutRequestId,
        paid: false,
      },
    });

    if (session) {
      await prisma.session.update({
        where: { id: session.id },
        data: { paid: true },
      });
      await grantAccess(session.ip);
      logger.info("Payment successful for session:", session.id);
    } else {
      logger.warn(
        "No matching session found for CheckoutRequestID:",
        checkoutRequestId
      );
    }
  } else {
    logger.error("Payment failed:", data);
  }
  res.send("OK");
}
