/**
 * Builds a signed Apple Wallet pass (.pkpass): pass.json, the images, manifest.json (each file's SHA-1)
 * and signature (a detached PKCS#7 signature of the manifest, made with the school's Pass Type ID
 * certificate and Apple's WWDR intermediate), zipped. Deno only (node-forge, fflate).
 */
import forge from 'npm:node-forge@1.3.1';
import { zipSync } from 'npm:fflate@0.8.2';
import { PASS_IMAGES } from './images.ts';
import { manifestFor } from './wallet.ts';

export type PassCert = { certPem: string; keyPem: string; keyPassword?: string; wwdrPem: string };

const enc = (s: string) => new TextEncoder().encode(s);
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toBinary = (b: Uint8Array) => { let s = ''; for (const x of b) s += String.fromCharCode(x); return s; };
const fromBinary = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function sign(manifest: Uint8Array, c: PassCert) {
  const cert = forge.pki.certificateFromPem(c.certPem);
  const key = c.keyPassword ? forge.pki.decryptRsaPrivateKey(c.keyPem, c.keyPassword) : forge.pki.privateKeyFromPem(c.keyPem);
  if (!key) throw new Error('The pass key could not be read (check APPLE_PASS_KEY and its password).');
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(toBinary(manifest));
  p7.addCertificate(cert);
  p7.addCertificate(forge.pki.certificateFromPem(c.wwdrPem));
  p7.addSigner({
    key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });
  return fromBinary(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

export async function makePkpass(pass: object, cert: PassCert): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = { 'pass.json': enc(JSON.stringify(pass)) };
  for (const [name, b64] of Object.entries(PASS_IMAGES)) files[name] = fromBase64(b64);
  const manifest = enc(JSON.stringify(await manifestFor(files)));
  files['manifest.json'] = manifest;
  files['signature'] = sign(manifest, cert);
  return zipSync(files, { level: 6 });
}
