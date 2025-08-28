import { ethers, getNamedAccounts, deployments } from "hardhat";
import { expect } from "chai";
import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { parseUnits } from "ethers";
import {
  VaultFactory,
  VaultFactory__factory,
  Vault,
  Vault__factory,
  ERC20Mintable,
  ERC20Mintable__factory,
  MockStrategy,
} from "../typechain-types";

describe("VaultFactory", () => {
  let vaultFactory: VaultFactory;
  let usdc: ERC20Mintable;
  let governance: ethers.Signer;
  let alice: ethers.Wallet;
  let bob: ethers.Wallet;
  let snapshot: SnapshotRestorer;
  const provider = ethers.provider;

  const timeUnlock = 7 * 24 * 60 * 60; // 7 days
  const amount = parseUnits("1000", 6); // 1000 USDC

  let vault: Vault;
  let strategy1: MockStrategy;
  let strategy2: MockStrategy;

  before(async () => {
    await deployments.fixture(["mock", "vaultFactory"]);
    const { deployer } = await getNamedAccounts();
    governance = await ethers.getSigner(deployer);

    usdc = ERC20Mintable__factory.connect(
      (await deployments.get("USDC")).address,
      provider
    );

    vaultFactory = VaultFactory__factory.connect(
      (await deployments.get("VaultFactory")).address,
      governance
    );

    alice = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);
    bob = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);

    await governance.sendTransaction({ to: alice.address, value: ethers.parseEther("100") });
    await governance.sendTransaction({ to: bob.address, value: ethers.parseEther("100") });

    snapshot = await takeSnapshot();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  beforeEach(async () => {
    const vaultParams = {
      agentName: "PoolA",
      asset: await usdc.getAddress(),
      tokenName: "Test Vault",
      tokenSymbol: "TVT",
      profitMaxUnlockTime: timeUnlock,
      governance: await governance.getAddress(),
    };
    const tx = await vaultFactory.createVault(vaultParams);
    const receipt = await tx.wait();
    const vaultEvent = receipt.logs
      .map((log) => {
        try {
          return vaultFactory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "VaultCreated");

    const vaultAddress = vaultEvent?.args.vault;
    expect(vaultAddress).to.not.be.undefined;
    vault = Vault__factory.connect(vaultAddress, governance);
    const MockStrategyFactory = await ethers.getContractFactory("MockStrategy", governance);
    strategy1 = (await MockStrategyFactory.deploy()) as MockStrategy;
    strategy2 = (await MockStrategyFactory.deploy()) as MockStrategy;
    const govAddr = await governance.getAddress();
    await strategy1.initialize(
      vaultAddress,
      govAddr,
      govAddr,
      await usdc.getAddress(),
      "Strategy 1",
      "STR1"
    );
    await strategy2.initialize(
      vaultAddress,
      govAddr,
      govAddr,
      await usdc.getAddress(),
      "Strategy 2",
      "STR2"
    );
    await usdc.connect(governance).mint(alice.address, amount);
    await usdc.connect(alice).approve(vaultAddress, amount);
  });

  it("should create a vault successfully and store params correctly", async () => {
    const vaults = await vaultFactory.listAllVaults();
    expect(vaults).to.include(await vault.getAddress());
    expect(await vaultFactory.isVault(await vault.getAddress())).to.be.true;
    const vaultParams = await vaultFactory.getVault(0);
    console.log("Vault Params:");
    console.log("  Agent Name:", vaultParams.agentName);
    console.log("  Asset:", vaultParams.asset);
    console.log("  Token Name:", vaultParams.tokenName);
    console.log("  Token Symbol:", vaultParams.tokenSymbol);
    console.log("  Profit Max Unlock Time:", vaultParams.profitMaxUnlockTime.toString());
    console.log("  Governance:", vaultParams.governance);
  });

  it("should return all vaults with params correctly", async () => {
    const vaultParams2 = {
      agentName: "PoolB",
      asset: await usdc.getAddress(),
      tokenName: "Test Vault 2",
      tokenSymbol: "TVT2",
      profitMaxUnlockTime: timeUnlock,
      governance: await governance.getAddress(),
    };
    await vaultFactory.createVault(vaultParams2);

    const allVaultsWithParams = await vaultFactory.listAllVaultsWithParams();
    console.log("All Vaults with Params:");
    allVaultsWithParams.forEach((params, index) => {
      console.log(`Vault ${index + 1}:`);
      console.log("  Agent Name:", params.agentName);
      console.log("  Asset:", params.asset);
      console.log("  Token Name:", params.tokenName);
      console.log("  Token Symbol:", params.tokenSymbol);
      console.log("  Profit Max Unlock Time:", params.profitMaxUnlockTime.toString());
      console.log("  Governance:", params.governance);
    });
  });

  it("should allow owner to add a strategy", async () => {
    await expect(
      vaultFactory.addStrategy(await vault.getAddress(), await strategy1.getAddress(), true)
    )
      .to.emit(vaultFactory, "StrategyAdded")
      .withArgs(await vault.getAddress(), await strategy1.getAddress(), true);
  });

  it("should revert when adding strategy with zero address", async () => {
    await expect(
      vaultFactory.addStrategy(await vault.getAddress(), ethers.ZeroAddress, true)
    ).to.be.revertedWith("Invalid strategy");
  });

  it("should revert when adding strategy to non-vault", async () => {
    await expect(
      vaultFactory.addStrategy(alice.address, await strategy1.getAddress(), true)
    ).to.be.revertedWith("Not a valid vault");
  });

  it("should allow rebalancing between two vaults", async () => {
    const vaultParams2 = {
      agentName: "PoolB",
      asset: await usdc.getAddress(),
      tokenName: "Test Vault 2",
      tokenSymbol: "TVT2",
      profitMaxUnlockTime: timeUnlock,
      governance: await governance.getAddress(),
    };
    const tx2 = await vaultFactory.createVault(vaultParams2);
    const receipt2 = await tx2.wait();
    const vaultEvent2 = receipt2.logs
      .map((log) => {
        try {
          return vaultFactory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "VaultCreated");
    const vault2Addr = vaultEvent2?.args.vault;
    const vault2 = Vault__factory.connect(vault2Addr, governance);
    await vault.connect(alice).deposit(amount, alice.address);
    await vault.connect(alice).approve(vaultFactory.getAddress(), amount);
    const totalAssetsBefore = await vault.totalAssets();
    expect(totalAssetsBefore).to.be.greaterThan(0n);
    await expect(
      vaultFactory.connect(alice).rebalanceBetweenVaults(
        await vault.getAddress(),
        vault2Addr,
        0
      )
    )
      .to.emit(vaultFactory, "VaultsRebalanced")
      .withArgs(await vault.getAddress(), vault2Addr, amount);
  });

  it("should revert rebalance if same vault", async () => {
    await expect(
      vaultFactory.rebalanceBetweenVaults(await vault.getAddress(), await vault.getAddress(), 0)
    ).to.be.revertedWith("Same vault");
  });

  it("should revert rebalance if assets differ", async () => {
    const ERC20MintableFactory = await ethers.getContractFactory("ERC20Mintable", governance);
    const otherToken = await ERC20MintableFactory.deploy("OtherToken", "OTH", 18);
    const vaultParams = {
      agentName: "PoolC",
      asset: await otherToken.getAddress(),
      tokenName: "VaultOther",
      tokenSymbol: "VOTH",
      profitMaxUnlockTime: timeUnlock,
      governance: await governance.getAddress(),
    };
    const tx = await vaultFactory.createVault(vaultParams);
    const receipt = await tx.wait();
    const vaultEvent = receipt.logs
      .map((log) => {
        try {
          return vaultFactory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "VaultCreated");
    const vaultOther = vaultEvent?.args.vault;

    await expect(
      vaultFactory.rebalanceBetweenVaults(await vault.getAddress(), vaultOther, 0)
    ).to.be.revertedWith("Different assets");
  });
});