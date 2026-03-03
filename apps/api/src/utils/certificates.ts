import { X509Certificate, createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { CertificateSummary } from "@aldo/shared";
import forge from "node-forge";

const CERT_BLOCK_REGEX = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
const URL_REGEX = /https?:\/\/[^\s,<>"]+/gi;

const normalizeFingerprint = (fingerprint: string): string =>
  fingerprint.replaceAll(":", "").toLowerCase();

const parseSanDns = (sanValue: string | undefined): string[] => {
  if (!sanValue) {
    return [];
  }
  return sanValue
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("DNS:"))
    .map((entry) => entry.replace("DNS:", "").trim())
    .filter(Boolean);
};

const parseUrls = (value: string): string[] => {
  const matches = value.match(URL_REGEX);
  if (!matches) {
    return [];
  }
  return [...new Set(matches.map((item) => item.trim()))];
};

const extractPemsFromPfx = (buffer: Buffer, passphrase?: string): string[] => {
  const der = buffer.toString("binary");
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, passphrase ?? "");
  const certBagOid = forge.pki.oids.certBag;
  if (!certBagOid) {
    throw new Error("Unable to resolve certificate bag OID.");
  }

  const bagCollectionUnknown: unknown = p12.getBags({ bagType: certBagOid });
  if (typeof bagCollectionUnknown !== "object" || bagCollectionUnknown === null) {
    return [];
  }

  const bagCollection = bagCollectionUnknown as Record<string, unknown>;
  const rawBags = bagCollection[certBagOid];
  if (!Array.isArray(rawBags)) {
    return [];
  }

  return rawBags
    .map((bag) => {
      if (typeof bag !== "object" || bag === null || !("cert" in bag)) {
        return null;
      }
      const cert = (bag as { cert?: unknown }).cert;
      if (!cert) {
        return null;
      }
      return forge.pki.certificateToPem(cert as forge.pki.Certificate);
    })
    .filter((pem): pem is string => Boolean(pem));
};

const toPemBlocks = (filePath: string, buffer: Buffer, passphrase?: string): string[] => {
  const extension = path.extname(filePath).toLowerCase();
  const text = buffer.toString("utf8");

  if (extension === ".pfx" || extension === ".p12") {
    return extractPemsFromPfx(buffer, passphrase);
  }

  if (text.includes("-----BEGIN CERTIFICATE-----")) {
    return text.match(CERT_BLOCK_REGEX) ?? [];
  }

  if (extension === ".cer" || extension === ".crt" || extension === ".der") {
    const der = buffer.toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
    return [`-----BEGIN CERTIFICATE-----\n${der}\n-----END CERTIFICATE-----\n`];
  }

  throw new Error(`Unsupported certificate format for ${path.basename(filePath)}`);
};

const certificateSummaryFromPem = (pem: string): CertificateSummary => {
  const x509 = new X509Certificate(pem);
  const detailsText = `${x509.toString()}\n${x509.infoAccess ?? ""}`;
  const urls = parseUrls(detailsText);
  const ocspUrls = urls.filter((url) => url.toLowerCase().includes("ocsp"));
  const cdpUrls = urls.filter(
    (url) =>
      url.toLowerCase().includes(".crl") ||
      url.toLowerCase().includes("/crl") ||
      !ocspUrls.includes(url)
  );

  const raw = x509.raw;
  const thumbprint = createHash("sha1").update(raw).digest("hex");

  return {
    thumbprint: normalizeFingerprint(thumbprint),
    subject: x509.subject,
    issuer: x509.issuer,
    sanDns: parseSanDns(x509.subjectAltName),
    notBefore: new Date(x509.validFrom).toISOString(),
    notAfter: new Date(x509.validTo).toISOString(),
    isSelfSigned: x509.subject === x509.issuer,
    chainId: x509.issuer,
    cdpUrls,
    ocspUrls
  };
};

export const parseCertificateBundle = async (
  filePath: string,
  passphrase?: string
): Promise<CertificateSummary[]> => {
  const data = await fs.readFile(filePath);
  const pems = toPemBlocks(filePath, data, passphrase).map((pem) => pem.trim()).filter(Boolean);
  return pems.map((pem) => certificateSummaryFromPem(pem));
};
