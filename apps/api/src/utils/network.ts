import dns from "node:dns/promises";
import net from "node:net";

import type { DnsCheckResult, TcpCheckResult } from "@aldo/shared";

export const runDnsCheck = async (endpoint: string): Promise<DnsCheckResult> => {
  try {
    const answers = await dns.lookup(endpoint, { all: true });
    return {
      endpoint,
      resolved: answers.length > 0,
      addresses: answers.map((answer) => answer.address)
    };
  } catch (error) {
    return {
      endpoint,
      resolved: false,
      addresses: [],
      message: error instanceof Error ? error.message : "DNS lookup failed"
    };
  }
};

export const runTcpCheck = async (
  targetIp: string,
  port = 443,
  timeoutMs = 5000
): Promise<TcpCheckResult> => {
  const started = Date.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: TcpCheckResult): void => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(timeoutMs);

    socket.connect(port, targetIp, () => {
      finish({
        targetIp,
        port,
        reachable: true,
        latencyMs: Date.now() - started
      });
    });

    socket.on("timeout", () => {
      finish({
        targetIp,
        port,
        reachable: false,
        message: `Timeout after ${timeoutMs}ms`
      });
    });

    socket.on("error", (error) => {
      finish({
        targetIp,
        port,
        reachable: false,
        message: error.message
      });
    });
  });
};
