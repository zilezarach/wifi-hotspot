import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { initiateStkPush } from "../services/mpesaService";
import { grantAccess, getUserMac } from "../services/accessService";
import logger from "../utils/logger";
import { isBefore, parseISO } from "date-fns";

const prisma = new PrismaClient();

const PLANS = [
  {
    id: "quick-surf",
    name: "Quick Surf",
    hours: 1,
    price: 10,
    dataCap: null,
    description: "1 Hour (Unlimited Data)"
  },
  {
    id: "daily-boost",
    name: "Daily Boost",
    hours: 24,
    price: 50,
    dataCap: 5000,
    description: "24 Hours (5GB Data Cap)"
  },
  {
    id: "family-share",
    name: "Family Share",
    hours: 24,
    price: 80,
    dataCap: 10000,
    description: "24 Hours (10GB Shared Data)"
  },
  {
    id: "weekly-unlimited",
    name: "Weekly Unlimited",
    hours: 168,
    price: 200,
    dataCap: null,
    description: "7 Days (Unlimited Data, up to 5Mbps)"
  },
  {
    id: "community-freebie",
    name: "Community Freebie",
    hours: 0.5,
    price: 0,
    dataCap: null,
    description: "30 Minutes/Day (Essentials Only)"
  }
];

export async function showPortal(req: Request, res: Response) {
  res.sendFile("index.html", { root: "public" });
}

export async function initiatePayment(
  req: Request<unknown, unknown, { planId: string; phone?: string }>,
  res: Response
) {
  const freeMode = process.env.FREE_MODE === "true";
  const freeModeEndDate = process.env.FREE_MODE_END_DATE ? parseISO(process.env.FREE_MODE_END_DATE) : null;
  const isFreePeriodActive = freeMode && freeModeEndDate && isBefore(new Date(), freeModeEndDate);

  const userIp = req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket.remoteAddress || "unknown";
  logger.info(`Detected user IP: ${userIp}`);
  const userMac = await getUserMac(userIp); // Fetch real MAC

  if (isFreePeriodActive) {
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // e.g., 24h free; adjust
    try {
      await prisma.session.create({
        data: {
          mac: userMac,
          ip: userIp,
          planName: "Free Promo",
          planHours: 24,
          dataCap: null,
          expiry,
          paid: true
        }
      });
      await grantAccess(userIp, true, null); // Limited access for free promo
      return res.json({
        message: "Welcome! Enjoy free access during the promo."
      });
    } catch (error) {
      logger.error("Free mode error:", error);
      return res.status(500).json({ error: "Server error" });
    }
  }

  const { planId, phone } = req.body;
  if (!planId) {
    return res.status(400).json({ error: "Missing planId" });
  }

  const selectedPlan = PLANS.find(p => p.id === planId);
  if (!selectedPlan) {
    return res.status(400).json({ error: "Invalid plan selected" });
  }

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
          paid: true
        }
      });
      await grantAccess(userIp, true, selectedPlan.dataCap); // Limited with data cap if set
      return res.json({ message: "Free access granted for 30 minutes!" });
    } catch (error) {
      logger.error("Free plan error:", error);
      return res.status(500).json({ error: "Server error" });
    }
  } else {
    if (!phone || !/^254\d{9}$/.test(phone)) {
      return res.status(400).json({ error: "Invalid or missing phone (format: 254xxxxxxxxx)" });
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
            checkoutRequestId
          }
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

export async function getSessionStatus(req: Request, res: Response) {
  const userIp = req.ip ?? "unknown";

  try {
    const session = await prisma.session.findFirst({
      where: {
        ip: userIp,
        paid: true,
        expiry: {
          gt: new Date()
        }
      },
      orderBy: {
        id: "desc"
      }
    });

    if (!session) {
      return res.json({
        hasActiveSession: false,
        timeRemaining: 0,
        plan: null
      });
    }

    const now = new Date();
    const timeRemaining = Math.max(0, Math.floor((session.expiry.getTime() - now.getTime()) / 1000));

    res.json({
      hasActiveSession: true,
      timeRemaining,
      plan: {
        name: session.planName,
        hours: session.planHours,
        dataCap: session.dataCap
      },
      expiry: session.expiry
    });
  } catch (error) {
    logger.error("Session status error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

export async function mpesaCallback(req: Request, res: Response) {
  const data = req.body.Body.stkCallback;
  const checkoutRequestId = data.CheckoutRequestID;

  if (data.ResultCode === 0) {
    const session = await prisma.session.findFirst({
      where: {
        checkoutRequestId,
        paid: false
      }
    });

    if (session) {
      await prisma.session.update({
        where: { id: session.id },
        data: { paid: true }
      });
      await grantAccess(session.ip, false, session.dataCap); // Pass dataCap for enforcement
      logger.info("Payment successful for session:", session.id);
    } else {
      logger.warn("No matching session found for CheckoutRequestID:", checkoutRequestId);
    }
  } else {
    logger.error("Payment failed:", data);
  }
  res.send("OK");
}
