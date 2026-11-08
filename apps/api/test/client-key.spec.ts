import { clientKeyOf } from '@/auth/client-key';

const from = (headers: Record<string, string | string[]>, remoteAddress?: string) => ({
  headers,
  socket: { remoteAddress },
});

describe('the key a failed authentication is counted under', () => {
  describe('behind a proxy that names the client in a header', () => {
    it('takes the address the header carries', () => {
      expect(clientKeyOf(from({ 'x-real-ip': '203.0.113.7' }, '10.0.0.1'), 'x-real-ip')).toBe(
        '203.0.113.7',
      );
    });

    it('reads the header whatever case the variable names it in', () => {
      expect(clientKeyOf(from({ 'x-real-ip': '203.0.113.7' }), 'X-Real-IP')).toBe('203.0.113.7');
    });

    it.each([
      ['missing', {}],
      ['not an address', { 'x-real-ip': 'somebody' }],
      ['a list of addresses', { 'x-real-ip': '203.0.113.7, 10.0.0.1' }],
      ['repeated', { 'x-real-ip': ['203.0.113.7', '203.0.113.8'] }],
      ['empty', { 'x-real-ip': '' }],
    ])('counts nothing when the header is %s, rather than the proxy', (_case, headers) => {
      expect(clientKeyOf(from(headers, '10.0.0.1'), 'x-real-ip')).toBeNull();
    });
  });

  describe('with no proxy header configured', () => {
    it('takes the address of the connection', () => {
      expect(clientKeyOf(from({ 'x-real-ip': '203.0.113.7' }, '198.51.100.4'), undefined)).toBe(
        '198.51.100.4',
      );
    });

    it('counts nothing when the connection has no address', () => {
      expect(clientKeyOf(from({}), undefined)).toBeNull();
    });
  });

  it.each([
    '::ffff:198.51.100.4',
    '::ffff:c633:6404',
    '0:0:0:0:0:ffff:198.51.100.4',
    '::FFFF:C633:6404',
  ])('counts the IPv4 address written as IPv6 in the form %s as the IPv4 one', (address) => {
    expect(clientKeyOf(from({}, address), undefined)).toBe('198.51.100.4');
  });

  it('counts every address of one IPv6 /64 as one client, since one client holds all of it', () => {
    const first = clientKeyOf(from({ 'x-real-ip': '2001:db8:1:2::1' }), 'x-real-ip');
    const second = clientKeyOf(
      from({ 'x-real-ip': '2001:0db8:0001:0002:ffff:ffff:ffff:ffff' }),
      'x-real-ip',
    );
    const neighbour = clientKeyOf(from({ 'x-real-ip': '2001:db8:1:3::1' }), 'x-real-ip');

    expect(first).toBe('2001:db8:1:2::/64');
    expect(second).toBe(first);
    expect(neighbour).not.toBe(first);
  });

  it('keys the shortest IPv6 forms without losing their groups', () => {
    expect(clientKeyOf(from({}, '::1'), undefined)).toBe('0:0:0:0::/64');
    expect(clientKeyOf(from({}, 'fe80::'), undefined)).toBe('fe80:0:0:0::/64');
  });
});
