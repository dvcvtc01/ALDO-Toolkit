const IPV4_SEGMENT = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4_REGEX = new RegExp(`^${IPV4_SEGMENT}(\\.${IPV4_SEGMENT}){3}$`);
const CIDR_REGEX = new RegExp(`^${IPV4_SEGMENT}(\\.${IPV4_SEGMENT}){3}\\/(\\d|[1-2]\\d|3[0-2])$`);

export type IpRange = {
  start: number;
  end: number;
};

export const isIpv4 = (value: string): boolean => IPV4_REGEX.test(value.trim());

export const ipv4ToInt = (value: string): number => {
  if (!isIpv4(value)) {
    throw new Error(`Invalid IPv4 address: ${value}`);
  }

  return value
    .trim()
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
};

export const intToIpv4 = (value: number): string => {
  const segment1 = (value >>> 24) & 255;
  const segment2 = (value >>> 16) & 255;
  const segment3 = (value >>> 8) & 255;
  const segment4 = value & 255;
  return `${segment1}.${segment2}.${segment3}.${segment4}`;
};

export const isCidr = (value: string): boolean => CIDR_REGEX.test(value.trim());

export const cidrToRange = (cidr: string): IpRange => {
  if (!isCidr(cidr)) {
    throw new Error(`Invalid CIDR: ${cidr}`);
  }

  const [ip, prefixRaw] = cidr.trim().split("/");
  if (!ip || !prefixRaw) {
    throw new Error(`Invalid CIDR: ${cidr}`);
  }
  const prefix = Number.parseInt(prefixRaw, 10);
  const base = ipv4ToInt(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const start = base & mask;
  const end = (start | (~mask >>> 0)) >>> 0;

  return { start, end };
};

export const parseIpPool = (value: string): IpRange => {
  const trimmed = value.trim();

  if (isCidr(trimmed)) {
    return cidrToRange(trimmed);
  }

  if (trimmed.includes("-")) {
    const [startIp, endIp] = trimmed.split("-");
    if (!startIp || !endIp || !isIpv4(startIp) || !isIpv4(endIp)) {
      throw new Error(`Invalid IP pool range: ${value}`);
    }

    const start = ipv4ToInt(startIp);
    const end = ipv4ToInt(endIp);
    if (start > end) {
      throw new Error(`IP pool start is greater than end: ${value}`);
    }

    return { start, end };
  }

  if (isIpv4(trimmed)) {
    const point = ipv4ToInt(trimmed);
    return { start: point, end: point };
  }

  throw new Error(`Unsupported IP pool format: ${value}`);
};

export const isIpInRange = (ip: string, range: IpRange): boolean => {
  if (!isIpv4(ip)) {
    return false;
  }
  const ipValue = ipv4ToInt(ip);
  return ipValue >= range.start && ipValue <= range.end;
};

export const rangesOverlap = (a: IpRange, b: IpRange): boolean => a.start <= b.end && b.start <= a.end;
