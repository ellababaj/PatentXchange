import { describe, it, expect, beforeEach } from "vitest";

interface Patent {
  patentId: string;
  metadataUri: string;
  inventor: string;
  verified: boolean;
  transferLocked: boolean;
}

interface MockPatentNFT {
  admin: string;
  paused: boolean;
  tokenIdCounter: bigint;
  verificationOracle: string;
  patents: Map<bigint, Patent>;
  owners: Map<bigint, string>;
  approvals: Map<bigint, string>;
  tokenCount: Map<string, bigint>;
  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  setVerificationOracle(caller: string, oracle: string): { value: boolean } | { error: number };
  mintPatent(caller: string, patentId: string, metadataUri: string, inventor: string): { value: bigint } | { error: number };
  verifyPatent(caller: string, tokenId: bigint): { value: boolean } | { error: number };
  transfer(caller: string, tokenId: bigint, recipient: string): { value: boolean } | { error: number };
  approve(caller: string, tokenId: bigint, operator: string): { value: boolean } | { error: number };
}

const mockPatentNFT: MockPatentNFT = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  tokenIdCounter: 0n,
  verificationOracle: "SP000000000000000000002Q6VF78",
  patents: new Map<bigint, Patent>(),
  owners: new Map<bigint, string>(),
  approvals: new Map<bigint, string>(),
  tokenCount: new Map<string, bigint>(),
  isAdmin(caller: string) {
    return caller === this.admin;
  },
  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },
  setVerificationOracle(caller: string, oracle: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (oracle === "SP000000000000000000002Q6VF78") return { error: 105 };
    this.verificationOracle = oracle;
    return { value: true };
  },
  mintPatent(caller: string, patentId: string, metadataUri: string, inventor: string) {
    if (this.paused) return { error: 104 };
    if (!this.isAdmin(caller)) return { error: 100 };
    if (inventor === "SP000000000000000000002Q6VF78") return { error: 105 };
    if (patentId.length === 0 || patentId.length > 64 || metadataUri.length === 0 || metadataUri.length > 256) return { error: 106 };
    const tokenId = this.tokenIdCounter + 1n;
    if (this.patents.has(tokenId)) return { error: 101 };
    this.patents.set(tokenId, { patentId, metadataUri, inventor, verified: false, transferLocked: true });
    this.owners.set(tokenId, inventor);
    this.tokenCount.set(inventor, (this.tokenCount.get(inventor) || 0n) + 1n);
    this.tokenIdCounter = tokenId;
    return { value: tokenId };
  },
  verifyPatent(caller: string, tokenId: bigint) {
    if (caller !== this.verificationOracle) return { error: 100 };
    if (!this.patents.has(tokenId)) return { error: 102 };
    const patent = this.patents.get(tokenId)!;
    this.patents.set(tokenId, { ...patent, verified: true, transferLocked: false });
    return { value: true };
  },
  transfer(caller: string, tokenId: bigint, recipient: string) {
    if (this.paused) return { error: 104 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 105 };
    if (!this.patents.has(tokenId)) return { error: 102 };
    const patent = this.patents.get(tokenId)!;
    if (!patent.verified) return { error: 103 };
    if (patent.transferLocked) return { error: 108 };
    if (this.owners.get(tokenId) !== caller) return { error: 100 };
    this.owners.set(tokenId, recipient);
    this.tokenCount.set(caller, (this.tokenCount.get(caller) || 0n) - 1n);
    this.tokenCount.set(recipient, (this.tokenCount.get(recipient) || 0n) + 1n);
    this.approvals.delete(tokenId);
    return { value: true };
  },
  approve(caller: string, tokenId: bigint, operator: string) {
    if (this.paused) return { error: 104 };
    if (!this.owners.has(tokenId)) return { error: 102 };
    if (this.owners.get(tokenId) !== caller) return { error: 100 };
    if (operator === "SP000000000000000000002Q6VF78") return { error: 105 };
    this.approvals.set(tokenId, operator);
    return { value: true };
  }
};

describe("PatentNFT Contract", () => {
  beforeEach(() => {
    mockPatentNFT.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockPatentNFT.paused = false;
    mockPatentNFT.tokenIdCounter = 0n;
    mockPatentNFT.verificationOracle = "SP000000000000000000002Q6VF78";
    mockPatentNFT.patents = new Map();
    mockPatentNFT.owners = new Map();
    mockPatentNFT.approvals = new Map();
    mockPatentNFT.tokenCount = new Map();
  });

  it("should mint a patent NFT when called by admin", () => {
    const result = mockPatentNFT.mintPatent(
      mockPatentNFT.admin,
      "US1234567",
      "ipfs://metadata",
      "ST2CY5..."
    );
    expect(result).toEqual({ value: 1n });
    expect(mockPatentNFT.patents.get(1n)).toEqual({
      patentId: "US1234567",
      metadataUri: "ipfs://metadata",
      inventor: "ST2CY5...",
      verified: false,
      transferLocked: true
    });
    expect(mockPatentNFT.owners.get(1n)).toBe("ST2CY5...");
    expect(mockPatentNFT.tokenCount.get("ST2CY5...")).toBe(1n);
  });

  it("should prevent minting with invalid metadata", () => {
    const result = mockPatentNFT.mintPatent(
      mockPatentNFT.admin,
      "",
      "ipfs://metadata",
      "ST2CY5..."
    );
    expect(result).toEqual({ error: 106 });
  });

  it("should prevent non-admin from minting", () => {
    const result = mockPatentNFT.mintPatent(
      "ST3NB...",
      "US1234567",
      "ipfs://metadata",
      "ST2CY5..."
    );
    expect(result).toEqual({ error: 100 });
  });

  it("should verify a patent when called by oracle", () => {
    mockPatentNFT.mintPatent(mockPatentNFT.admin, "US1234567", "ipfs://metadata", "ST2CY5...");
    mockPatentNFT.setVerificationOracle(mockPatentNFT.admin, "ST3NB...");
    const result = mockPatentNFT.verifyPatent("ST3NB...", 1n);
    expect(result).toEqual({ value: true });
    expect(mockPatentNFT.patents.get(1n)?.verified).toBe(true);
    expect(mockPatentNFT.patents.get(1n)?.transferLocked).toBe(false);
  });

  it("should transfer a verified patent NFT", () => {
    mockPatentNFT.mintPatent(mockPatentNFT.admin, "US1234567", "ipfs://metadata", "ST2CY5...");
    mockPatentNFT.verifyPatent(mockPatentNFT.verificationOracle, 1n);
    const result = mockPatentNFT.transfer("ST2CY5...", 1n, "ST3NB...");
    expect(result).toEqual({ value: true });
    expect(mockPatentNFT.owners.get(1n)).toBe("ST3NB...");
    expect(mockPatentNFT.tokenCount.get("ST2CY5...")).toBe(0n);
    expect(mockPatentNFT.tokenCount.get("ST3NB...")).toBe(1n);
  });

  it("should prevent transfer of unverified patent", () => {
    mockPatentNFT.mintPatent(mockPatentNFT.admin, "US1234567", "ipfs://metadata", "ST2CY5...");
    const result = mockPatentNFT.transfer("ST2CY5...", 1n, "ST3NB...");
    expect(result).toEqual({ error: 103 });
  });

  it("should approve an operator", () => {
    mockPatentNFT.mintPatent(mockPatentNFT.admin, "US1234567", "ipfs://metadata", "ST2CY5...");
    const result = mockPatentNFT.approve("ST2CY5...", 1n, "ST3NB...");
    expect(result).toEqual({ value: true });
    expect(mockPatentNFT.approvals.get(1n)).toBe("ST3NB...");
  });

  it("should not allow transfers when paused", () => {
    mockPatentNFT.mintPatent(mockPatentNFT.admin, "US1234567", "ipfs://metadata", "ST2CY5...");
    mockPatentNFT.verifyPatent(mockPatentNFT.verificationOracle, 1n);
    mockPatentNFT.setPaused(mockPatentNFT.admin, true);
    const result = mockPatentNFT.transfer("ST2CY5...", 1n, "ST3NB...");
    expect(result).toEqual({ error: 104 });
  });
});