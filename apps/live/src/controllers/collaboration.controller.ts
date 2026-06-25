/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Hocuspocus } from "@hocuspocus/server";
import type { Request as ExpressRequest } from "express";
import type WebSocket from "ws";
// plane imports
import { Controller, WebSocket as WSDecorator } from "@plane/decorators";
import { logger } from "@plane/logger";

@Controller("/collaboration")
export class CollaborationController {
  [key: string]: unknown;
  private readonly hocusPocusServer: Hocuspocus;

  constructor(hocusPocusServer: Hocuspocus) {
    this.hocusPocusServer = hocusPocusServer;
  }

  // Clients connect to `${LIVE_BASE_PATH}/collaboration`. express-ws internally
  // suffixes the registered route (and the incoming upgrade URL) with
  // `/.websocket`, so this single handler is what answers the handshake.
  @WSDecorator("/")
  handleConnection(ws: WebSocket, req: ExpressRequest) {
    this.acceptConnection(ws, req);
  }

  private acceptConnection(ws: WebSocket, req: ExpressRequest) {
    try {
      // Initialize the connection with Hocuspocus
      this.hocusPocusServer.handleConnection(ws, req as unknown as Request);

      // Set up error handling for the connection
      ws.on("error", (error: Error) => {
        logger.error("COLLABORATION_CONTROLLER: WebSocket connection error:", error);
        ws.close(1011, "Internal server error");
      });
    } catch (error) {
      logger.error("COLLABORATION_CONTROLLER: WebSocket connection error:", error);
      ws.close(1011, "Internal server error");
    }
  }
}
