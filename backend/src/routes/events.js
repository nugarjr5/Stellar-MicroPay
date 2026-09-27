"use strict";

const express = require("express");
const { Server } = require("@stellar/stellar-sdk/rpc");

const router = express.Router();

const RPC_URL =
  process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";

const CONTRACT_ID = process.env.CONTRACT_ID;

const sorobanServer = new Server(RPC_URL);

router.get("/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders();

  let closed = false;
  let lastLedger = null;

  const sendEvent = (event) => {
    if (closed) return;

    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  sendEvent({
    type: "connected",
    message: "SSE connection established",
  });

  const poll = async () => {
    if (closed) return;

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
          limit: 100,
        };

        const result = await sorobanServer.getEvents(request);

        for (const event of result.events || []) {
          sendEvent({
            type: "soroban_event",
            event,
          });
        }

        lastLedger = latest.sequence;
      }
    } catch (error) {
      sendEvent({
        type: "error",
        message: "Failed to fetch Soroban events",
      });
    }
  };

  const interval = setInterval(poll, 5000);

  req.on("close", () => {
    closed = true;
    clearInterval(interval);
    res.end();
  });

  await poll();
});

module.exports = router;
