"use strict";

const express = require("express");
const { Server } = require("@stellar/stellar-sdk/rpc");

const router = express.Router();

const RPC_URL =
  process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";

const CONTRACT_ID = process.env.CONTRACT_ID;

const sorobanServer = new Server(RPC_URL);

const clients = new Set();
let lastLedger = null;
let polling = false;

const sendEvent = (res, event) => {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};

const broadcast = (event) => {
  for (const client of clients) {
    try {
      sendEvent(client, event);
    } catch (error) {
      clients.delete(client);
    }
  }
};

const pollEvents = async () => {
  if (polling) return;

  polling = true;

  try {
    const latest = await sorobanServer.getLatestLedger();

    if (lastLedger === null) {
      lastLedger = Math.max(1, latest.sequence - 1);
    }

    if (latest.sequence > lastLedger) {
      const request = {
        startLedger: lastLedger + 1,
        endLedger: latest.sequence,
        filters: CONTRACT_ID
          ? [
              {
                type: "contract",
                contractIds: [CONTRACT_ID],
              },
            ]
          : [],
        pagination: {
          limit: 100,
        },
      };

      const result = await sorobanServer.getEvents(request);

      for (const event of result.events || []) {
        broadcast({
          type: "soroban_event",
          event,
        });
      }

      lastLedger = latest.sequence;
    }
  } catch (error) {
    broadcast({
      type: "error",
      message: "Failed to fetch Soroban events",
    });
  } finally {
    polling = false;
  }
};

router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders();

  clients.add(res);

  sendEvent(res, {
    type: "connected",
    message: "SSE connection established",
  });

  const cleanup = () => {
    clients.delete(res);
    res.end();
  };

  req.on("close", cleanup);
});

setInterval(pollEvents, 5000);
pollEvents();

module.exports = router;
