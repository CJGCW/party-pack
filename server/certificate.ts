import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import selfsigned from 'selfsigned';

const CERT_DIR = resolve(import.meta.dirname, '..', '.certs');
const KEY_FILE = resolve(CERT_DIR, 'key.pem');
const CERT_FILE = resolve(CERT_DIR, 'cert.pem');
const META_FILE = resolve(CERT_DIR, 'meta.json');

/**
 * A self-signed certificate for serving the phones over HTTPS, which browsers
 * require before they'll share motion sensors. It's kept in .certs/ so phones
 * that accepted it don't get the warning again, and remade if the computer's
 * network address changes.
 */
export function loadCertificate(lanAddress: string): { key: string; cert: string } {
  if (existsSync(KEY_FILE) && existsSync(CERT_FILE) && existsSync(META_FILE)) {
    try {
      const meta = JSON.parse(readFileSync(META_FILE, 'utf8'));
      const fresh = Date.now() < meta.expires - 7 * 24 * 60 * 60 * 1000;
      if (meta.address === lanAddress && fresh) return { key: readFileSync(KEY_FILE, 'utf8'), cert: readFileSync(CERT_FILE, 'utf8') };
    } catch {
      // Unreadable: make a new one.
    }
  }

  const days = 825;
  const generated = selfsigned.generate([{ name: 'commonName', value: 'Party Pack' }], {
    days,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          ...(/^\d+\.\d+\.\d+\.\d+$/.test(lanAddress) ? [{ type: 7, ip: lanAddress }] : []),
        ],
      },
    ],
  });
  mkdirSync(CERT_DIR, { recursive: true });
  writeFileSync(KEY_FILE, generated.private);
  writeFileSync(CERT_FILE, generated.cert);
  writeFileSync(META_FILE, JSON.stringify({ address: lanAddress, expires: Date.now() + days * 24 * 60 * 60 * 1000 }));
  return { key: generated.private, cert: generated.cert };
}
