/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Hocuspocus } from "@hocuspocus/server";
import type { IncomingHttpHeaders } from "http";
import type { Request as ExpressRequest } from "express";
import type WebSocket from "ws";
// plane imports
import { Controller, WebSocket as WSDecorator } from "@plane/decorators";
import { logger } from "@plane/logger";

/**
 * Convert Node's plain-object request headers into a WHATWG `Headers` instance.
 * Hocuspocus 4.x (and Plane's `onAuthenticate`, which calls
 * `requestHeaders.get("cookie")`) expects a `Headers` object, but express
 * exposes headers as a plain object.
 */
const toHeaders = (raw: IncomingHttpHeaders): Headers => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }
  return headers;
};

/**
 * Normalise an incoming WebSocket frame to a standalone `Uint8Array`.
 * Hocuspocus queues messages for replay after authentication, so the bytes
 * must be copied out of any pooled Node `Buffer`.
 */
const toUint8Array = (data: WebSocket.RawData): Uint8Array => {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  return new Uint8Array(data as Buffer);
};

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
      // Hocuspocus 4.x is transport-agnostic: `handleConnection` builds a
      // ClientConnection but does NOT attach any socket listeners itself. The
      // integration is responsible for forwarding `message`/`close` events to
      // it (see Hocuspocus' own crossws integration). Without this the socket
      // stays open but no frame is ever processed — auth/sync never run, the
      // document never loads, and the client is stuck "Syncing…". We also pass
      // a request whose `headers` is a WHATWG `Headers` object so that
      // `onAuthenticate` can read the session cookie.
      const hocuspocusRequest = {
        url: req.url,
        headers: toHeaders(req.headers),
      } as unknown as Request;

      const connection = this.hocusPocusServer.handleConnection(ws, hocuspocusRequest);

      ws.on("message", (data: WebSocket.RawData) => {
        connection.handleMessage(toUint8Array(data));
      });

      ws.on("close", (code: number, reason: Buffer) => {
        connection.handleClose({ code, reason: reason?.toString() ?? "" } as CloseEvent);
      });

      // Set up error handling for the connection
      ws.on("error", (error: Error) => {
        logger.error("COLLABORATION_CONTROLLER: WebSocket connection error:", error);
      });
    } catch (error) {
      logger.error("COLLABORATION_CONTROLLER: WebSocket connection error:", error);
      ws.close(1011, "Internal server error");
    }
  }
}
