import { describe, it, expect, beforeEach, vi } from "vitest";

interface Listing {
  seller: string;
  price: bigint;
  licenseTerm: bigint | null;
  royaltyRate: bigint;
}

interface Escrow {
  buyer: string;
  amount: bigint;
  lockedUntil: bigint;
}

interface MockPatentNFTContract {
  transfer: (tokenId: bigint, from: string, to: string) => { value: boolean } | { error: number };
  getOwner: (tokenId: bigint) => { value: string } | { error: number };
}

interface MockMarketplace {
  admin: string;
  paused: boolean;
  patentNftContract: string;
  escrowFee: bigint;
  listings: Map<bigint, Listing>;
  escrow: Map<bigint, Escrow>;
  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  setPatentNftContract(caller: string, contract: string): { value: boolean } | { error: number };
  setEscrowFee(caller: string, fee: bigint): { value: boolean } | { error: number };
  listPatent(caller: string, tokenId: bigint, price: bigint, licenseTerm: bigint | null, royaltyRate: bigint): { value: boolean } | { error: number };
  unlistPatent(caller: string, tokenId: bigint): { value: boolean } | { error: number };
  buyPatent(caller: string, tokenId: bigint, stxTransfer: (amount: bigint, from: string, to: string) => { value: boolean } | { error: number }): { value: boolean } | { error: number };
  licensePatent(caller: string, tokenId: bigint, stxTransfer: (amount: bigint, from: string, to: string) => { value: boolean } | { error: number }): { value: boolean } | { error: number };
  releaseEscrow(caller: string, tokenId: bigint, blockHeight: bigint): { value: boolean } | { error: number };
}

const mockPatentNFT: MockPatentNFTContract = {
  transfer: vi.fn((tokenId: bigint, from: string, to: string) => ({ value: true })),
  getOwner: vi.fn((tokenId: bigint) => ({ value: "ST2CY5..." }))
};

const mockMarketplace: MockMarketplace = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  patentNftContract: "SP000000000000000000002Q6VF78",
  escrowFee: 100n,
  listings: new Map<bigint, Listing>(),
  escrow: new Map<bigint, Escrow>(),
  isAdmin(caller: string) {
    return caller === this.admin;
  },
  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 200 };
    this.paused = pause;
    return { value: pause };
  },
  setPatentNftContract(caller: string, contract: string) {
    if (!this.isAdmin(caller)) return { error: 200 };
    if (contract === "SP000000000000000000002Q6VF78") return { error: 207 };
    this.patentNftContract = contract;
    return { value: true };
  },
  setEscrowFee(caller: string, fee: bigint) {
    if (!this.isAdmin(caller)) return { error: 200 };
    if (fee > 1000n) return { error: 204 };
    this.escrowFee = fee;
    return { value: true };
  },
  listPatent(caller: string, tokenId: bigint, price: bigint, licenseTerm: bigint | null, royaltyRate: bigint) {
    if (this.paused) return { error: 206 };
    const ownerResult = mockPatentNFT.getOwner(tokenId);
    if ("error" in ownerResult || ownerResult.value !== caller) return { error: 200 };
    if (price === 0n) return { error: 204 };
    if (royaltyRate > 1000n) return { error: 204 };
    if (licenseTerm !== null && licenseTerm === 0n) return { error: 208 };
    if (this.listings.has(tokenId)) return { error: 203 };
    this.listings.set(tokenId, { seller: caller, price, licenseTerm, royaltyRate });
    return { value: true };
  },
  unlistPatent(caller: string, tokenId: bigint) {
    if (this.paused) return { error: 206 };
    const ownerResult = mockPatentNFT.getOwner(tokenId);
    if ("error" in ownerResult || ownerResult.value !== caller) return { error: 200 };
    if (!this.listings.has(tokenId)) return { error: 202 };
    this.listings.delete(tokenId);
    return { value: true };
  },
  buyPatent(caller: string, tokenId: bigint, stxTransfer: (amount: bigint, from: string, to: string) => { value: boolean } | { error: number }) {
    if (this.paused) return { error: 206 };
    const listing = this.listings.get(tokenId);
    if (!listing) return { error: 202 };
    if (listing.licenseTerm !== null) return { error: 208 };
    const fee = (listing.price * this.escrowFee) / 10000n;
    const sellerAmount = listing.price - fee;
    const sellerTransfer = stxTransfer(sellerAmount, caller, listing.seller);
    const feeTransfer = stxTransfer(fee, caller, this.admin);
    if ("error" in sellerTransfer || "error" in feeTransfer) return { error: 205 };
    const transferResult = mockPatentNFT.transfer(tokenId, listing.seller, caller);
    if ("error" in transferResult) return { error: 201 };
    this.listings.delete(tokenId);
    this.escrow.delete(tokenId);
    return { value: true };
  },
  licensePatent(caller: string, tokenId: bigint, stxTransfer: (amount: bigint, from: string, to: string) => { value: boolean } | { error: number }) {
    if (this.paused) return { error: 206 };
    const listing = this.listings.get(tokenId);
    if (!listing) return { error: 202 };
    if (listing.licenseTerm === null) return { error: 208 };
    const fee = (listing.price * this.escrowFee) / 10000n;
    const sellerAmount = listing.price - fee;
    const sellerTransfer = stxTransfer(sellerAmount, caller, listing.seller);
    const feeTransfer = stxTransfer(fee, caller, this.admin);
    if ("error" in sellerTransfer || "error" in feeTransfer) return { error: 205 };
    this.escrow.set(tokenId, { buyer: caller, amount: listing.price, lockedUntil: 100n + listing.licenseTerm });
    return { value: true };
  },
  releaseEscrow(caller: string, tokenId: bigint, blockHeight: bigint) {
    if (this.paused) return { error: 206 };
    const escrowData = this.escrow.get(tokenId);
    if (!escrowData) return { error: 202 };
    if (blockHeight < escrowData.lockedUntil) return { error: 209 };
    this.escrow.delete(tokenId);
    return { value: true };
  }
};

describe("Marketplace Contract", () => {
  beforeEach(() => {
    mockMarketplace.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockMarketplace.paused = false;
    mockMarketplace.patentNftContract = "SP000000000000000000002Q6VF78";
    mockMarketplace.escrowFee = 100n;
    mockMarketplace.listings = new Map();
    mockMarketplace.escrow = new Map();
    vi.resetAllMocks();
  });

  it("should list a patent for sale", () => {
    mockPatentNFT.getOwner = vi.fn(() => ({ value: "ST2CY5..." }));
    const result = mockMarketplace.listPatent("ST2CY5...", 1n, 1000n, null, 500n);
    expect(result).toEqual({ value: true });
    expect(mockMarketplace.listings.get(1n)).toEqual({
      seller: "ST2CY5...",
      price: 1000n,
      licenseTerm: null,
      royaltyRate: 500n
    });
  });

  it("should prevent listing with invalid price", () => {
    mockPatentNFT.getOwner = vi.fn(() => ({ value: "ST2CY5..." }));
    const result = mockMarketplace.listPatent("ST2CY5...", 1n, 0n, null, 500n);
    expect(result).toEqual({ error: 204 });
  });

  it("should unlist a patent", () => {
    mockPatentNFT.getOwner = vi.fn(() => ({ value: "ST2CY5..." }));
    mockMarketplace.listPatent("ST2CY5...", 1n, 1000n, null, 500n);
    const result = mockMarketplace.unlistPatent("ST2CY5...", 1n);
    expect(result).toEqual({ value: true });
    expect(mockMarketplace.listings.has(1n)).toBe(false);
  });

  it("should buy a patent", () => {
    mockPatentNFT.getOwner = vi.fn(() => ({ value: "ST2CY5..." }));
    mockPatentNFT.transfer = vi.fn(() => ({ value: true }));
    const stxTransfer = vi.fn(() => ({ value: true }));
    mockMarketplace.listPatent("ST2CY5...", 1n, 1000n, null, 500n);
    const result = mockMarketplace.buyPatent("ST3NB...", 1n, stxTransfer);
    expect(result).toEqual({ value: true });
    expect(stxTransfer).toHaveBeenCalledWith(990n, "ST3NB...", "ST2CY5...");
    expect(stxTransfer).toHaveBeenCalledWith(10n, "ST3NB...", mockMarketplace.admin);
    expect(mockPatentNFT.transfer).toHaveBeenCalledWith(1n, "ST2CY5...", "ST3NB...");
    expect(mockMarketplace.listings.has(1n)).toBe(false);
  });

  it("should license a patent", () => {
    mockPatentNFT.getOwner = vi.fn(() => ({ value: "ST2CY5..." }));
    const stxTransfer = vi.fn(() => ({ value: true }));
    mockMarketplace.listPatent("ST2CY5...", 1n, 1000n, 100n, 500n);
    const result = mockMarketplace.licensePatent("ST3NB...", 1n, stxTransfer);
    expect(result).toEqual({ value: true });
    expect(stxTransfer).toHaveBeenCalledWith(990n, "ST3NB...", "ST2CY5...");
    expect(stxTransfer).toHaveBeenCalledWith(10n, "ST3NB...", mockMarketplace.admin);
    expect(mockMarketplace.escrow.get(1n)).toEqual({
      buyer: "ST3NB...",
      amount: 1000n,
      lockedUntil: 200n
    });
  });

  it("should release escrow after license term", () => {
    mockPatentNFT.getOwner = vi.fn(() => ({ value: "ST2CY5..." }));
    const stxTransfer = vi.fn(() => ({ value: true }));
    mockMarketplace.listPatent("ST2CY5...", 1n, 1000n, 100n, 500n);
    mockMarketplace.licensePatent("ST3NB...", 1n, stxTransfer);
    const result = mockMarketplace.releaseEscrow("ST3NB...", 1n, 200n);
    expect(result).toEqual({ value: true });
    expect(mockMarketplace.escrow.has(1n)).toBe(false);
  });

  it("should prevent escrow release before term", () => {
    mockPatentNFT.getOwner = vi.fn(() => ({ value: "ST2CY5..." }));
    const stxTransfer = vi.fn(() => ({ value: true }));
    mockMarketplace.listPatent("ST2CY5...", 1n, 1000n, 100n, 500n);
    mockMarketplace.licensePatent("ST3NB...", 1n, stxTransfer);
    const result = mockMarketplace.releaseEscrow("ST3NB...", 1n, 150n);
    expect(result).toEqual({ error: 209 });
  });

  it("should not allow actions when paused", () => {
    mockPatentNFT.getOwner = vi.fn(() => ({ value: "ST2CY5..." }));
    mockMarketplace.setPaused(mockMarketplace.admin, true);
    const result = mockMarketplace.listPatent("ST2CY5...", 1n, 1000n, null, 500n);
    expect(result).toEqual({ error: 206 });
  });
});