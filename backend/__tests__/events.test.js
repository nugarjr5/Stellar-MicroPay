"use strict";

const request = require("supertest");

const mockGetLatestLedger = jest.fn();
const mockGetEvents = jest.fn();

jest.mock("@stellar/stellar-sdk/rpc", () => ({
  Server: jest.fn(() => ({
    getLatestLedger: mockGetLatestLedger,
    getEvents: mockGetEvents,
  })),
}));

const app = require("../src/server");

describe("GET /api/events/stream", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetLatestLedger.mockResolvedValue({
      sequence: 100,
    });

    mockGetEvents.mockResolvedValue({
      events: [],
    });
  });

  it("opens an SSE connection", async () => {
    const response = await request(app)
      .get("/api/events/stream")
      .buffer(false)
      .parse((res, callback) => {
        res.on("data", () => {
          res.destroy();
          callback(null, Buffer.alloc(0));
        });
      });

    expect(response.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(response.headers["cache-control"]).toBe("no-cache");
  });
});
