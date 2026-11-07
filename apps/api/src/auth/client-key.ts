import { type IncomingHttpHeaders } from 'node:http';
import { isIPv4, isIPv6 } from 'node:net';

export interface ClientSource {
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
}

const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;
const IPV6_GROUPS = 8;
const PREFIX_GROUPS = 4;

function groupsOf(part: string): string[] {
  return part === '' ? [] : part.split(':');
}

function prefix64(address: string): string {
  const [head = '', tail] = address.split('::');
  const leading = groupsOf(head);
  const trailing = tail === undefined ? [] : groupsOf(tail);
  const missing = IPV6_GROUPS - leading.length - trailing.length;
  const groups = [...leading, ...Array<string>(missing).fill('0'), ...trailing];

  return `${groups
    .slice(0, PREFIX_GROUPS)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(':')}::/64`;
}

function keyOf(address: string | undefined): string | null {
  if (address === undefined) {
    return null;
  }

  const mapped = IPV4_MAPPED.exec(address)?.[1];
  if (mapped !== undefined && isIPv4(mapped)) {
    return mapped;
  }
  if (isIPv4(address)) {
    return address;
  }

  return isIPv6(address) ? prefix64(address) : null;
}

export function clientKeyOf(source: ClientSource, header: string | undefined): string | null {
  if (header === undefined || header === '') {
    return keyOf(source.socket.remoteAddress);
  }

  const value = source.headers[header.toLowerCase()];

  return typeof value === 'string' ? keyOf(value.trim()) : null;
}
