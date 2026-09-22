import { describe, expect, it } from "vitest";
import { normalizePemKey } from "../src/pem.js";

describe("normalizePemKey", () => {
  it("leaves a real multi-line PEM untouched", () => {
    const real = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nIBAAKCAQ\n-----END RSA PRIVATE KEY-----\n";
    expect(normalizePemKey(real)).toBe(real);
  });

  it("unescapes literal \\n sequences when there are no real newlines", () => {
    const escaped = "-----BEGIN RSA PRIVATE KEY-----\\nMIIEow\\nIBAAKCAQ\\n-----END RSA PRIVATE KEY-----\\n";
    expect(normalizePemKey(escaped)).toBe(
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nIBAAKCAQ\n-----END RSA PRIVATE KEY-----\n",
    );
  });

  it("does not mangle a value that already has real newlines even if it also contains a literal backslash-n somewhere", () => {
    const mixed = "-----BEGIN RSA PRIVATE KEY-----\nsome\\nliteral\n-----END RSA PRIVATE KEY-----\n";
    expect(normalizePemKey(mixed)).toBe(mixed);
  });
});
