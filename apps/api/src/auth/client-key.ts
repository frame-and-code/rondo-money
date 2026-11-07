import { type IncomingHttpHeaders } from 'node:http';
import { isIPv4, isIPv6 } from 'node:net';

export interface ClientSource {
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
}

const IPV6_GROUPS = 8;
const PREFIX_GROUPS = 4;
const MAPPED_MARKER_GROUP = 5;
const DOTTED_TAIL = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/;

function groupsOf(part: string): string[] {
  return part === '' ? [] : part.split(':');
}

function withHexTail(address: string): string {
  return address.replace(DOTTED_TAIL, (_tail, a: string, b: string, c: string, d: string) => {
    const [high, low] = [(Number(a) << 8) | Number(b), (Number(c) << 8) | Number(d)].map((group) =>
      group.toString(16),
    );

    return `${high}:${low}`;
  });
}

function expanded(address: string): number[] {
  const [head = '', tail] = withHexTail(address).split('::');
  const leading = groupsOf(head);
  const trailing = tail === undefined ? [] : groupsOf(tail);
  const missing = IPV6_GROUPS - leading.length - trailing.length;

  return [...leading, ...Array<string>(missing).fill('0'), ...trailing].map((group) =>
    Number.parseInt(group, 16),
  );
}

function mappedIPv4(groups: number[]): string | null {
  const marked =
    groups.slice(0, MAPPED_MARKER_GROUP).every((group) => group === 0) &&
    groups[MAPPED_MARKER_GROUP] === 0xffff;
  const [high = 0, low = 0] = groups.slice(MAPPED_MARKER_GROUP + 1);

  return marked ? [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.') : null;
}

function keyOf(address: string | undefined): string | null {
  if (address === undefined) {
    return null;
  }
  if (isIPv4(address)) {
    return address;
  }
  if (!isIPv6(address)) {
    return null;
  }

  const groups = expanded(address);

  return (
    mappedIPv4(groups) ??
    `${groups
      .slice(0, PREFIX_GROUPS)
      .map((group) => group.toString(16))
      .join(':')}::/64`
  );
}

export function clientKeyOf(source: ClientSource, header: string | undefined): string | null {
  if (header === undefined || header === '') {
    return keyOf(source.socket.remoteAddress);
  }

  const value = source.headers[header.toLowerCase()];

  return typeof value === 'string' ? keyOf(value.trim()) : null;
}
